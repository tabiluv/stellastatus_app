const { EventEmitter } = require('events');
const { profileFor, orderFor } = require('./roster');

const CHZZK_PUBLIC = 'https://api.chzzk.naver.com';
const MIN_INTERVAL_SEC = 30;

/**
 * stellastatus 라이브러리를 사용해 스텔라이브 전체 멤버의 방송 상태를 주기적으로 조회하고,
 * 오프라인 → 라이브 전환을 감지해 이벤트로 알린다.
 *
 * 이벤트:
 *  - 'update'      (members[])            매 폴링마다 전체 멤버 상태
 *  - 'transitions' ({ wentLive, wentOffline })  직전 상태 대비 전환된 멤버
 *  - 'error'       (Error)                폴링 중 오류
 *  - 'polling'     (boolean)              폴링 시작/종료(로딩 표시용)
 */
class Poller extends EventEmitter {
  constructor() {
    super();
    this._client = null;      // { chzzk, schedule }
    this._roster = [];        // listChannels() 결과
    this._timer = null;
    this._intervalMs = 60_000;
    this._prevLive = new Map();       // key -> isLive
    this._avatarCache = new Map();    // channelId -> imageUrl
    this._members = [];               // 마지막 병합 결과
    this._busy = false;
  }

  /** ESM 라이브러리를 로드하고 클라이언트를 초기화한다. */
  async init() {
    // stellastatus 는 ESM 모듈이므로 CommonJS 메인에서 동적 import 로 불러온다.
    const mod = await import('stellastatus');
    this._client = mod.createStellaStatus();
    this._roster = mod.listChannels();
    return this._roster;
  }

  get client() {
    return this._client;
  }

  get members() {
    return this._members;
  }

  /** 오프라인 멤버도 프로필 이미지를 표시하기 위해 채널 이미지를 조회(캐시). 실패해도 무시. */
  async _fetchAvatar(channelId) {
    if (this._avatarCache.has(channelId)) return this._avatarCache.get(channelId);
    try {
      const res = await fetch(`${CHZZK_PUBLIC}/service/v1/channels/${channelId}`, {
        headers: { 'User-Agent': 'stellastatus-app', Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        const url = json?.content?.channelImageUrl || null;
        this._avatarCache.set(channelId, url);
        return url;
      }
    } catch {
      /* 네트워크 오류는 조용히 무시(아바타는 부가 정보) */
    }
    this._avatarCache.set(channelId, null);
    return null;
  }

  /** 라이브러리 상태 + 프로필 메타 + 아바타를 하나의 멤버 객체로 병합. */
  _merge(status, meta) {
    const p = profileFor(meta.key);
    const avatar = status.channel?.imageUrl || this._avatarCache.get(meta.id) || null;
    return {
      key: meta.key,
      id: meta.id,
      name: meta.name,
      nameEng: p.nameEng,
      nameJa: p.nameJa,
      nameJaKana: p.nameJaKana,
      logo: p.logoKey || meta.key, // 로고 파일명(assets/logos/<logo>.png)
      gen: meta.gen,
      genName: meta.genName,
      order: orderFor(meta.key), // 로스터(기수) 정렬 순서

      accent: p.accent,
      accent2: p.accent2,
      emoji: p.emoji,
      channelUrl: p.channelUrl,
      cafe: p.cafe,
      // 프로필 아이콘 팝아웃용 소셜 링크(있는 것만 표시). chzzk 는 채널 URL 에서 자동 채움.
      social: {
        chzzk: p.channelUrl || null,
        youtube: p.youtube || null,
        x: p.x || null,
        instagram: p.instagram || null,
      },
      avatar,
      isLive: Boolean(status.isLive),
      title: status.title || null,
      category: status.category || null,
      tags: status.tags || [],
      viewerCount: status.viewerCount ?? null,
      thumbnail: status.thumbnail || null,
      openDate: status.openDate || null,
      followerCount: status.channel?.followerCount ?? null,
      liveUrl: status.liveUrl || p.channelUrl,
      error: status.error || null,
    };
  }

  /** 한 번 폴링한다. */
  async pollOnce() {
    if (!this._client) await this.init();
    if (this._busy) return this._members;
    this._busy = true;
    this.emit('polling', true);
    try {
      const statuses = await this._client.chzzk.getAllLiveStatuses();

      // 아바타 선(先)조회(캐시에 없을 때만). 병렬.
      await Promise.all(
        this._roster.map((ch) =>
          this._avatarCache.has(ch.id) ? Promise.resolve() : this._fetchAvatar(ch.id),
        ),
      );

      // roster 순서(기수별)로 병합
      const byKey = new Map(statuses.map((s) => [s.channel?.key, s]));
      const members = this._roster.map((ch) => {
        const st = byKey.get(ch.key) || { isLive: false, channel: { id: ch.id, key: ch.key, name: ch.name } };
        return this._merge(st, ch);
      });

      // 전환 감지
      const wentLive = [];
      const wentOffline = [];
      for (const m of members) {
        // 조회 실패(연결 끊김 등)로 라이브 여부를 알 수 없는 멤버는 '상태 불명'으로 보고
        // 이전 상태를 그대로 유지하며 전환으로 치지 않는다.
        //  → 와이파이가 끊겼다 다시 붙을 때 라이브러리가 그 사이 멤버를 isLive:false(error) 로
        //    돌려주는데, 이를 '오프라인' 으로 기록하면 재연결 시 '오프라인→라이브' 로 오인해
        //    알림·브라우저 자동 열기가 다시 발동한다(끊길 때 휴방 알림도 잘못 뜬다). 그것을 막는다.
        if (m.error) continue;
        const prev = this._prevLive.get(m.key);
        if (prev === false && m.isLive) wentLive.push(m);
        if (prev === true && !m.isLive) wentOffline.push(m);
        this._prevLive.set(m.key, m.isLive);
      }

      this._members = members;
      this.emit('update', members);
      if (wentLive.length || wentOffline.length) {
        this.emit('transitions', { wentLive, wentOffline });
      }
      return members;
    } catch (err) {
      this.emit('error', err);
      return this._members;
    } finally {
      this._busy = false;
      this.emit('polling', false);
    }
  }

  /** 폴링 시작. intervalSec 이하로는 MIN_INTERVAL_SEC 로 보정. */
  start(intervalSec) {
    this.setInterval(intervalSec);
    this.pollOnce();
    this._arm();
  }

  _arm() {
    this.stop();
    this._timer = setInterval(() => this.pollOnce(), this._intervalMs);
  }

  setInterval(intervalSec) {
    const sec = Math.max(MIN_INTERVAL_SEC, Number(intervalSec) || 60);
    this._intervalMs = sec * 1000;
    if (this._timer) this._arm();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { Poller, MIN_INTERVAL_SEC };
