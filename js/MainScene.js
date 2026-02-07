/* MainScene.js - V10~V13 QA 최적화 (Null Safety, Race Condition, Performance) */
import { db } from './network.js';
import { getStartData } from './startData.js';

/* === 경제·밸런스 상수 (Economy & Balance) === */
const ROCK_TARGET = 25, TREE_TARGET = 25, REMAINING_PER = 6;  /* 8→6: 채집지당 수확량 감소, 인플레이션 완화 */
const SHOUT_COST = 50;
const REPUTATION_DISPLAY_DURATION = 3000;
const ANNOUNCEMENT_DURATION = 5000;
const TERRITORY_RADIUS = 20 * 32;
const TNT_EXPLODE_DELAY = 3000;
const TNT_EXPLODE_RADIUS = 96;
const TNT_PLAYER_DAMAGE = 100;       /* 즉사 유지 */
const TNT_TOTEM_DAMAGE = 1000;
const TNT_COST_STONE = 60, TNT_COST_WOOD = 60, TNT_COST_HP = 60;  /* 50→60: TNT 비용 상승 */
const TOTEM_REPAIR_COST = 12;       /* 10→12: 토템 수리 비용 상승 */
const TOTEM_REPAIR_AMOUNT = 500;
const FIST_PLAYER_DAMAGE = 25;      /* 20→25: 5회→4회 사망, 긴장감 상승 (V8) */
const FIST_TOTEM_DAMAGE = 25;       /* 토템 주먹 데미지 */
/* 월드 크기 — 우측 이동 제한 해제 */
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 600;
/* V14: 사법 시스템 */
const PRISON_CENTER_X = 64, PRISON_CENTER_Y = 64;
const PRISON_GRID_MIN = -16, PRISON_GRID_MAX = 176;  /* 5x5 내부 + 벽 둘러쌈 */
const JAIL_DURATION_MS = 30000;
const ARREST_REP_THRESHOLD = -20;   /* 이 평판 이하만 체포 가능 */
const BATON_REP_REQUIRED = 20;      /* 진압봉 사용 최소 평판 */
/* V15: 펫 & 커스터마이징 */
const PET_FOLLOW_LERP = 0.08;       /* 펫 추적 부드러움 */
const PET_FOLLOW_DIST = 40;         /* 주인과 유지 거리 */
/* V18: 환경·날씨 시스템 — 월드 내부 기준 */
const BIOME_SNOW_Y = 80;            /* y < 이 값: 설원 (화면 상단) */
const BIOME_DESERT_X = WORLD_WIDTH - 80;  /* x > 이 값: 사막 (우측 끝) */
const SNOW_HP_PER_SEC = 1;
const DESERT_SPEED_MULT = 0.5;
const WEATHER_INTERVAL_MS = 180000; /* 3분 */
const ACID_RAIN_DAMAGE = 5;         /* 산성비 초당 데미지 */
const ACID_RAIN_BLOCK_DAMAGE = 2;   /* 건물 초당 데미지 */
const CRYSTAL_TARGET = 8;           /* 설원·사막 각 구역당 수 */
const CRYSTAL_REMAINING = 3;
/* V17: 오프라인 시간 시뮬레이션 */
const OFFLINE_RATE = 0.1;           /* 오프라인 시 감소 속도 10% */
const OFFLINE_24H_SEC = 86400;      /* 24시간 (초) */
const PET_HUNGER_PER_SEC = 1 / 600; /* 배고픔 1당 600초 (10분) */
const TOTEM_ENTROPY_PER_SEC = 10000 / 8640; /* 24h 오프라인 시 토템 파괴 (8640 = 24h * 0.1) */
const PET_HUNGER_MAX = 100;         /* 100 도달 시 펫 도망 */

const safeVal = (v, def = null) => (v != null ? v : def);
const safeNum = (v, def = 0) => (typeof v === 'number' && !isNaN(v) ? v : def);

/** V17: 초 단위를 "N시간 M분" 형식으로 변환 */
function formatOfflineTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}초`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}분`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `${hours}시간 ${remainMins}분` : `${hours}시간`;
}

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'main' });
    }

    init() {
        const data = getStartData();
        if (!data) throw new Error('startData not set');
        const uid = data.myId;
        if (!uid || typeof uid !== 'string') {
            throw new Error('myId (auth.uid)가 유효하지 않습니다. Anonymous Auth가 완료된 후 게임을 시작해주세요.');
        }
        this.myId = uid;
        this.myNickname = data.myNickname;
        this.myColor = data.myColor;
        this.currentMaterial = 'wall';
        this.lastDir = { x: 0, y: 0 };
        this.players = {};
        this.playerTexts = {};
        this.playerHpBars = {};
        this.blocks = {};
        this.doorKeys = new Set();
        this.doorOpenUntil = {};
        this.tntTimers = {};
        this.explodingBlocks = new Set();
        this.myHp = 100;
        this.myStone = 0;
        this.myWood = 0;
        this.myCrystal = 0;
        this.gatherProgress = {};
        this.totemsData = {};
        this.myTribeId = null;
        this.myTribeColor = null;
        this.myReputation = 0;
        this.reputationMenuTimer = null;
        this.announcementTimer = null;
        this.tradeEffectTimer = null;
        this.shopLabels = {};
        this._uiCache = null;
        /* V14: 감옥 */
        this.myIsJailed = false;
        this.myJailedUntil = 0;
        this.prisonBlockKeys = new Set();
        /* V15: 펫 & 모자 */
        this.myPetSprite = null;
        this.myHatSprite = null;
        this.myPetType = null;
        this.myHatType = null;
        this.myPetHunger = 0;       /* V17: 0(만땅) ~ 100(도망) */
        this.playerPetData = {};    /* id -> { petSprite, petX, petY, petType, hatSprite, hatType } */
        /* V16: 이모티콘 시스템 */
        this.playerEmoticonTexts = {};
        this.myEmoticonText = null;
        this.playerLastEmoticonTime = {};
        this.EMOTICON_DURATION = 3000;
        /* V18: 환경·날씨 */
        this.weather = 'clear';      /* clear | rain | acid_rain */
        this.weatherEmitter = null;
        this.weatherParticles = null;
        this.acidRainDamageAccum = 0;
    }

    getUICache() {
        if (!this._uiCache) {
            this._uiCache = {
                materialIndicator: document.getElementById('material-indicator'),
                chatInput: document.getElementById('chat-input'),
                myStone: document.getElementById('my-stone'),
                myWood: document.getElementById('my-wood'),
                myCrystal: document.getElementById('my-crystal'),
                status: document.getElementById('status')
            };
        }
        return this._uiCache;
    }

    preload() {
        this.load.image('dude', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        const g = this.make.graphics({ x: 0, y: 0 });

        g.fillStyle(0x888888); g.fillRect(0, 0, 32, 32); g.lineStyle(2, 0x555555); g.strokeRect(0, 0, 32, 32); g.generateTexture('wall', 32, 32);
        g.clear(); g.fillStyle(0x4CAF50); g.fillRect(0, 0, 32, 32); g.fillStyle(0x388E3C); g.fillCircle(10, 10, 2); g.fillCircle(25, 25, 3); g.generateTexture('grass', 32, 32);
        g.clear(); g.fillStyle(0x2196F3); g.fillRect(0, 0, 32, 32); g.generateTexture('water', 32, 32);
        g.clear(); g.fillStyle(0x8D6E63); g.fillRect(4, 4, 24, 20); g.fillStyle(0x5D4037); g.fillRect(14, 24, 4, 8); g.fillStyle(0xFFFFFF); g.fillRect(8, 10, 16, 2); g.fillRect(8, 16, 12, 2); g.generateTexture('sign', 32, 32);
        g.clear(); g.fillStyle(0x6D4C41); g.fillRect(0, 0, 32, 32); g.fillStyle(0x5D4037); g.fillRect(4, 4, 24, 24); g.fillStyle(0x4E342E); g.fillRect(12, 8, 8, 12); g.fillStyle(0xBCAAA4); g.fillRect(14, 10, 4, 4); g.lineStyle(2, 0x3E2723); g.strokeRect(4, 4, 24, 24); g.generateTexture('door', 32, 32);
        g.clear(); g.fillStyle(0xFFFFFF); g.fillCircle(16, 12, 10); g.fillStyle(0x111111); g.fillCircle(12, 10, 2); g.fillCircle(20, 10, 2); g.fillRect(10, 18, 12, 4); g.generateTexture('skull', 32, 32);
        g.clear(); g.fillStyle(0x6D6D6D); g.fillCircle(16, 18, 12); g.fillStyle(0x555555); g.fillCircle(12, 16, 4); g.fillCircle(20, 18, 3); g.lineStyle(2, 0x444444); g.strokeCircle(16, 18, 12); g.generateTexture('rock', 32, 32);
        g.clear(); g.fillStyle(0x5D4037); g.fillRect(14, 16, 4, 16); g.fillStyle(0x388E3C); g.fillCircle(16, 12, 10); g.fillStyle(0x2E7D32); g.fillCircle(12, 14, 4); g.fillCircle(20, 12, 4); g.generateTexture('tree', 32, 32);
        g.clear(); g.fillStyle(0x8D6E63, 0.8); g.fillRect(8, 12, 16, 8); g.fillStyle(0xFFFFFF); g.fillRect(10, 14, 4, 4); g.fillRect(18, 14, 4, 4); g.generateTexture('drop', 32, 32);
        g.clear(); g.fillStyle(0xFFD700); g.fillRect(8, 8, 16, 20); g.fillStyle(0xFFA500); g.fillRect(10, 10, 12, 16); g.fillStyle(0xFFD700); g.fillCircle(16, 6, 6); g.lineStyle(2, 0xB8860B); g.strokeRect(8, 8, 16, 20); g.generateTexture('totem', 32, 32);
        g.clear(); g.fillStyle(0xC62828); g.fillEllipse(16, 12, 14, 6); g.fillStyle(0xB71C1C); g.fillRect(2, 12, 28, 12); g.fillEllipse(16, 24, 14, 6); g.fillStyle(0x1B5E20); g.fillRect(14, 4, 4, 8); g.lineStyle(2, 0x8B0000); g.strokeRect(2, 12, 28, 12); g.generateTexture('tnt', 32, 32);
        g.clear(); g.fillStyle(0x1976D2); g.fillRect(0, 0, 32, 32); g.fillStyle(0xFFFFFF); for (let i = 0; i < 8; i++) g.fillRect(i * 4, 0, 2, 32); g.fillStyle(0xBBDEFB); g.fillRect(8, 12, 16, 12); g.fillStyle(0x1976D2); g.fillRect(14, 4, 4, 8); g.lineStyle(2, 0x0D47A1); g.strokeRect(0, 0, 32, 32); g.generateTexture('shop', 32, 32);
        /* V14: bedrock(감옥 벽), police_baton(진압봉) */
        g.clear(); g.fillStyle(0x2d2d2d); g.fillRect(0, 0, 32, 32); g.fillStyle(0x1a1a1a); g.fillRect(4, 4, 24, 24); g.fillStyle(0x444444); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(6 + i * 6, 6 + j * 6, 4, 4); g.lineStyle(2, 0x111111); g.strokeRect(0, 0, 32, 32); g.generateTexture('bedrock', 32, 32);
        g.clear(); g.fillStyle(0x1565C0); g.fillRect(12, 8, 8, 24); g.fillStyle(0x0D47A1); g.fillRect(14, 6, 4, 6); g.lineStyle(2, 0x0D47A1); g.strokeRect(12, 6, 8, 26); g.generateTexture('police_baton', 32, 32);
        /* V15: 펫 & 커스터마이징 */
        g.clear(); g.fillStyle(0x9E9E9E); g.fillCircle(16, 18, 10); g.fillStyle(0x757575); g.fillEllipse(6, 6, 8, 10); g.fillEllipse(26, 6, 8, 10); g.fillStyle(0x424242); g.fillCircle(12, 16, 2); g.fillCircle(20, 16, 2); g.generateTexture('pet_koala', 32, 32);
        g.clear(); g.fillStyle(0xFAFAFA); g.fillEllipse(16, 20, 12, 10); g.fillStyle(0xEEEEEE); g.fillEllipse(16, 8, 6, 14); g.fillStyle(0xF5F5F5); g.fillCircle(16, 2, 4); g.fillStyle(0x9E9E9E); g.fillCircle(14, 4, 1); g.fillCircle(18, 4, 1); g.generateTexture('pet_alpaca', 32, 32);
        g.clear(); g.fillStyle(0x4CAF50); g.fillEllipse(16, 16, 14, 8); g.fillStyle(0x388E3C); g.fillCircle(8, 14, 3); g.fillCircle(24, 14, 3); g.fillStyle(0x2E7D32); g.fillRect(14, 20, 4, 4); g.generateTexture('pet_gecko', 32, 32);
        g.clear(); g.fillStyle(0x212121); g.fillEllipse(16, 12, 14, 6); g.fillStyle(0x1a1a1a); g.fillRect(4, 8, 24, 8); g.fillStyle(0x37474F); g.fillRect(6, 14, 20, 2); g.lineStyle(2, 0x0D0D0D); g.strokeEllipse(16, 12, 14, 6); g.generateTexture('hat_fedora', 32, 32);
        /* V18: 희귀 광물 (Crystal) — 돌 텍스처 색상 변경 */
        g.clear(); g.fillStyle(0x7B1FA2); g.fillCircle(16, 18, 12); g.fillStyle(0x9C27B0); g.fillCircle(12, 16, 4); g.fillCircle(20, 18, 3); g.lineStyle(2, 0x4A148C); g.strokeCircle(16, 18, 12); g.generateTexture('crystal', 32, 32);
        /* 파티클용 픽셀 */
        g.clear(); g.fillStyle(0xffffff); g.fillRect(0, 0, 2, 2); g.generateTexture('pixel', 2, 2);
    }

    create() {
        /* 물리·카메라 — 넓은 월드 + 플레이어 팔로우 */
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.cameras.main.setScroll(0, 0);
        this.cameras.main.setBackgroundColor('#0c0a0e');
        this.cameras.main.alpha = 0;
        /* 배경 분위기 — 버려진 세상의 은은한 저녁 */
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0d0c12, 0x0d0c12, 0x0c0a0e, 0x0c0a0e, 0.5);
        bg.fillRect(-50, -50, 900, 700);
        bg.setScrollFactor(0);
        bg.setDepth(-100);
        this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 1400, ease: 'Power2' });
        const ui = this.getUICache();
        db.ref(".info/connected").on("value", (snap) => {
            if (ui.status) {
                ui.status.innerText = snap.val() ? "연결됨" : "끊김";
                ui.status.style.color = snap.val() ? "#00ff00" : "red";
            }
        });

        this.input.mouse.disableContextMenu();

        this.floorGroup = this.add.group();
        this.wallGroup = this.physics.add.staticGroup();
        this.signGroup = this.physics.add.staticGroup();
        this.doorGroup = this.physics.add.staticGroup();
        this.tntGroup = this.physics.add.staticGroup();
        this.shopGroup = this.physics.add.staticGroup();
        this.resourceGroup = this.physics.add.staticGroup();
        this.dropGroup = this.add.group();
        this.totemGroup = this.physics.add.staticGroup();
        this.otherPlayersGroup = this.physics.add.group();
        this.prisonWallGroup = this.physics.add.staticGroup();

        /* V14: 감옥 구역 - (0,0) 주변 5x5를 bedrock으로 둘러쌈 */
        for (let gx = -1; gx <= 5; gx++) {
            for (let gy = -1; gy <= 5; gy++) {
                if (gx === -1 || gx === 5 || gy === -1 || gy === 5) {
                    const px = gx * 32 + 16, py = gy * 32 + 16;
                    const key = `${px}_${py}`;
                    const block = this.prisonWallGroup.create(px, py, 'bedrock');
                    block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody();
                    block.setDepth(5); block.setData('type', 'bedrock');
                    this.blocks[key] = block;
                    this.prisonBlockKeys.add(key);
                }
            }
        }

        let startX, startY;
        const spawnTilesX = Math.floor(WORLD_WIDTH / 32);
        const spawnTilesY = Math.floor(WORLD_HEIGHT / 32);
        do {
            startX = Math.floor(Math.random() * spawnTilesX) * 32 + 16;
            startY = Math.floor(Math.random() * spawnTilesY) * 32 + 16;
        } while (startX >= PRISON_GRID_MIN && startX <= PRISON_GRID_MAX && startY >= PRISON_GRID_MIN && startY <= PRISON_GRID_MAX); /* V14: 감옥에서 스폰 방지 */

        this.myPlayer = this.physics.add.sprite(startX, startY, 'dude');
        this.myPlayer.setTint(this.myColor);
        this.myPlayer.setCollideWorldBounds(true);
        this.myPlayer.body.setSize(28, 32);
        this.myPlayer.body.setOffset(2, 0);
        this.myPlayer.setPushable(false);
        this.myPlayer.setDepth(10);
        /* 카메라가 플레이어를 따라가도록 (우측 이동 제한 해제) */
        this.cameras.main.startFollow(this.myPlayer, true, 0.1, 0.1);

        this.marker = this.add.graphics();
        this.marker.lineStyle(2, 0xffffff, 1);
        this.marker.strokeRect(0, 0, 32, 32);
        this.marker.setDepth(100);

        this.myHpBar = this.add.graphics().setDepth(11);
        this.myText = this.add.text(startX, startY - 35, this.myNickname, {
            fontSize: '12px', fill: '#fff', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
        }).setOrigin(0.5).setDepth(11);

        this.physics.add.collider(this.myPlayer, this.wallGroup);
        this.physics.add.collider(this.myPlayer, this.signGroup);
        this.physics.add.collider(this.myPlayer, this.doorGroup);
        this.physics.add.collider(this.myPlayer, this.tntGroup);
        this.physics.add.collider(this.myPlayer, this.shopGroup);
        this.physics.add.collider(this.myPlayer, this.resourceGroup);
        this.physics.add.collider(this.myPlayer, this.totemGroup);
        this.physics.add.collider(this.myPlayer, this.otherPlayersGroup);
        this.physics.add.collider(this.myPlayer, this.prisonWallGroup);
        this.physics.add.collider(this.otherPlayersGroup, this.prisonWallGroup);

        this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        this.key4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
        this.key5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
        this.key6 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);
        this.key7 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN);
        this.key8 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT);
        this.key9 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE);
        this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        /* V17: 오프라인 시뮬레이션 — userData/블록 로드 후 catchUp 적용, 그 다음 players 설정 */
        this.loadUserDataAndCatchUp(startX, startY, () => this.continueCreateAfterCatchUp());
    }

    /** V17: userData·블록 로드 → catchUp 적용 → players 설정 → onDisconnect/beforeunload */
    loadUserDataAndCatchUp(startX, startY, onDone) {
        const myId = this.myId;
        db.ref('userData/' + myId).once('value', (userSnap) => {
            db.ref('blocks').once('value', (blocksSnap) => {
                const userData = userSnap.val() || {};
                const blocksData = blocksSnap.val() || {};
                const lastLogin = safeNum(userData.lastLoginTime, 0);
                const now = Date.now();
                const offlineSeconds = lastLogin > 0 ? (now - lastLogin) / 1000 : 0;

                let petType = safeVal(userData.petType);
                let petHunger = safeNum(userData.petHunger, 0);
                let tribeId = safeVal(userData.tribeId);
                let tribeColor = safeVal(userData.tribeColor);
                const savedStone = safeNum(userData.stone, 0);
                const savedWood = safeNum(userData.wood, 0);
                const savedCrystal = safeNum(userData.crystal, 0);
                const savedHp = Math.min(100, Math.max(0, safeNum(userData.hp, 100)));

                if (offlineSeconds > 0) {
                    const effectiveSeconds = offlineSeconds * OFFLINE_RATE;
                    const is24hOrMore = offlineSeconds >= OFFLINE_24H_SEC;

                    if (petType && (petType === 'koala' || petType === 'alpaca' || petType === 'gecko')) {
                        petHunger += effectiveSeconds * PET_HUNGER_PER_SEC;
                        if (petHunger >= PET_HUNGER_MAX || is24hOrMore) {
                            petType = null;
                            petHunger = 0;
                        }
                    }

                    const myTotemKeys = Object.keys(blocksData).filter((k) => {
                        const b = blocksData[k];
                        return b && b.type === 'totem' && b.ownerId === myId;
                    });
                    for (const tk of myTotemKeys) {
                        const totem = blocksData[tk];
                        const curHp = safeNum(totem.hp, 10000);
                        const damage = effectiveSeconds * TOTEM_ENTROPY_PER_SEC;
                        const nhp = Math.max(0, curHp - damage);
                        if (nhp <= 0 || is24hOrMore) {
                            db.ref('blocks/' + tk).remove();
                            if (tribeId === tk) { tribeId = null; tribeColor = null; }
                        } else {
                            db.ref('blocks/' + tk).update({ hp: nhp });
                        }
                    }

                    if (offlineSeconds >= 60) {
                        const timeStr = formatOfflineTime(offlineSeconds);
                        const msgs = [];
                        if (petType && petHunger > 20) msgs.push('펫이 배고파합니다!');
                        if (myTotemKeys.length > 0) msgs.push('토템이 시간에 시달립니다.');
                        if (petType === null && userData.petType) msgs.push('펫이 도망쳤습니다.');
                        const msg = msgs.length > 0 ? `${timeStr}이 흘렀습니다. ${msgs.join(' ')}` : `${timeStr}이 흘렀습니다.`;
                        this.time.delayedCall(800, () => this.showToast('당신이 떠나있는 동안 ' + msg));
                    }
                }

                this.myPetHunger = Math.min(PET_HUNGER_MAX, petHunger);
                this.myTribeId = tribeId;
                this.myTribeColor = tribeColor;

                const playerData = {
                    x: startX, y: startY, nickname: this.myNickname, color: this.myColor,
                    hp: savedHp, stone: savedStone, wood: savedWood, crystal: savedCrystal,
                    tribeId, tribeColor, reputation: safeNum(userData.reputation, 0),
                    petType, hatType: safeVal(userData.hatType), petHunger: this.myPetHunger
                };
                db.ref('players/' + myId).set(playerData);

                db.ref('userData/' + myId).update({
                    lastLoginTime: now, petType, petHunger: this.myPetHunger, tribeId, tribeColor,
                    stone: playerData.stone, wood: playerData.wood, crystal: playerData.crystal, hp: playerData.hp, reputation: playerData.reputation, hatType: playerData.hatType
                });
                db.ref('userData/' + myId).onDisconnect().update({
                    lastLoginTime: firebase.database.ServerValue.TIMESTAMP
                });

                const saveOnLeave = () => {
                    db.ref('userData/' + myId).update({
                        lastLoginTime: Date.now(),
                        petType: this.myPetType,
                        petHunger: this.myPetHunger,
                        tribeId: this.myTribeId,
                        tribeColor: this.myTribeColor,
                        stone: this.myStone,
                        wood: this.myWood,
                        crystal: this.myCrystal,
                        hp: this.myHp,
                        reputation: this.myReputation,
                        hatType: this.myHatType
                    });
                };
                window.addEventListener('beforeunload', saveOnLeave);

                db.ref('players/' + myId).onDisconnect().remove();

                /* V17: 30초마다 userData 동기화 (크래시 시 데이터 손실 완화) */
                this.time.addEvent({ delay: 30000, loop: true, callback: () => this.syncUserDataForOffline() });

                onDone();
            });
        });
    }

    continueCreateAfterCatchUp() {
        this.maybeSpawnResources();
        this.time.addEvent({ delay: 15000, loop: true, callback: () => this.maybeSpawnResources() });
        this.maybeSpawnCrystals();
        this.time.addEvent({ delay: 20000, loop: true, callback: () => this.maybeSpawnCrystals() });

        /* V18: 날씨 타이머 — 3분마다 랜덤 변경 */
        const weatherTypes = ['clear', 'rain', 'acid_rain'];
        db.ref('server/weather').once('value', (snap) => {
            let w = snap.val();
            if (!w || !weatherTypes.includes(w)) {
                w = 'clear';
                db.ref('server/weather').set(w);
            }
            this.weather = w;
            this.updateWeatherEffects();
            this.updateWeatherIndicator();
        });
        db.ref('server/weather').on('value', (snap) => {
            const w = snap.val();
            if (w && weatherTypes.includes(w)) {
                this.weather = w;
                this.updateWeatherEffects();
                this.updateWeatherIndicator();
            }
        });
        this.time.addEvent({
            delay: WEATHER_INTERVAL_MS, loop: true,
            callback: () => {
                const next = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
                db.ref('server/weather').set(next);
                this.showToast(next === 'acid_rain' ? '☠️ 산성비!' : next === 'rain' ? '🌧 비' : '☀️ 맑음');
            }
        });

        const getTotemAt = (gx, gy) => {
            for (const k in this.totemsData) {
                const t = this.totemsData[k];
                if (!t) continue;
                const d = Math.sqrt((gx - t.x) ** 2 + (gy - t.y) ** 2);
                if (d <= TERRITORY_RADIUS) return { key: k, ownerId: t.ownerId, color: t.color };
            }
            return null;
        };
        const isOwnerOrCitizenOf = (totem) => totem && (totem.ownerId === this.myId || this.myTribeId === totem.key);
        const canBuildHere = (gx, gy) => {
            if (gx >= PRISON_GRID_MIN && gx <= PRISON_GRID_MAX && gy >= PRISON_GRID_MIN && gy <= PRISON_GRID_MAX) return false;
            return true;
        };

        const canvasEl = this.sys.game.canvas;
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const doBuildOrDelete = (e) => {
            if (e.button !== 0) return;
            if (!gameContainer.contains(e.target)) return;
            const rect = canvasEl.getBoundingClientRect();
            const scaleX = canvasEl.width / rect.width;
            const scaleY = canvasEl.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            const gridX = Math.floor(x / 32) * 32 + 16;
            const gridY = Math.floor(y / 32) * 32 + 16;
            const blockKey = `${gridX}_${gridY}`;

            const isShift = e.shiftKey || this.shiftKey.isDown;
            if (isShift) {
                if (this.prisonBlockKeys.has(blockKey) || !canBuildHere(gridX, gridY)) {
                    this.showToast("감옥 구역에서는 건설/파괴할 수 없습니다.");
                    return;
                }
                const totem = getTotemAt(gridX, gridY);
                if (totem && !isOwnerOrCitizenOf(totem)) {
                    this.showToast("이 영토에서 건설/파괴할 권한이 없습니다.");
                    return;
                }
                db.ref('blocks/' + blockKey).remove();
                return;
            }

            for (const id in this.players) {
                if (id === this.myId) continue;
                const p = this.players[id];
                if (p && p.active && Phaser.Math.Distance.Between(x, y, p.x, p.y) < 30) {
                    const pid = id;
                    /* V14: 진압봉으로 체포 */
                    if (this.currentMaterial === 'police_baton') {
                        if (this.myReputation < BATON_REP_REQUIRED) {
                            this.showToast("권한이 없습니다. (평판 20 이상 필요)");
                            return;
                        }
                        db.ref('players/' + pid).once('value', (snap) => {
                            const d = snap.val();
                            if (!d) return;
                            const targetRep = safeNum(d.reputation);
                            if (targetRep > ARREST_REP_THRESHOLD) {
                                this.showToast("일반 시민은 체포할 수 없습니다.");
                                return;
                            }
                            const jailedUntil = Date.now() + JAIL_DURATION_MS;
                            db.ref('players/' + pid).update({
                                x: PRISON_CENTER_X, y: PRISON_CENTER_Y,
                                isJailed: true, jailedUntil
                            });
                            this.showToast("체포 완료.");
                            this.cameras.main.shake(120, 0.008);
                            const hitFx = this.add.circle(p.x, p.y - 16, 3, 0x1565C0, 0.9);
                            this.tweens.add({ targets: hitFx, scaleX: 5, scaleY: 5, alpha: 0, duration: 200, onComplete: () => hitFx.destroy() });
                        });
                        return;
                    }
                    /* 기존 주먹 공격 */
                    this.cameras.main.shake(120, 0.008);
                    const hitFx = this.add.circle(p.x, p.y - 16, 3, 0xc0392b, 0.9);
                    this.tweens.add({ targets: hitFx, scaleX: 4, scaleY: 4, alpha: 0, duration: 150, onComplete: () => hitFx.destroy() });
                    db.ref('players/' + pid).once('value', (snap) => {
                        const d = snap.val();
                        if (!d) return;
                        if (this.myTribeId && d.tribeId === this.myTribeId) return;
                        const newHp = Math.max(0, safeNum(d.hp, 100) - FIST_PLAYER_DAMAGE);
                        const sx = safeNum(d.x), sy = safeNum(d.y);
                        if (newHp <= 0) {
                            const stx = Math.floor(WORLD_WIDTH / 32), sty = Math.floor(WORLD_HEIGHT / 32);
                            let rx = Math.floor(Math.random() * stx) * 32 + 16, ry = Math.floor(Math.random() * sty) * 32 + 16;
                            for (let i = 0; i < 10; i++) {
                                if (!(rx >= PRISON_GRID_MIN && rx <= PRISON_GRID_MAX && ry >= PRISON_GRID_MIN && ry <= PRISON_GRID_MAX)) break;
                                rx = Math.floor(Math.random() * stx) * 32 + 16;
                                ry = Math.floor(Math.random() * sty) * 32 + 16;
                            }
                            const s = Math.floor(safeNum(d.stone) * 0.5);
                            const w = Math.floor(safeNum(d.wood) * 0.5);
                            const c = Math.floor(safeNum(d.crystal) * 0.5);
                            db.ref('players/' + pid).update({ x: rx, y: ry, hp: 100, stone: Math.max(0, safeNum(d.stone) - s), wood: Math.max(0, safeNum(d.wood) - w), crystal: Math.max(0, safeNum(d.crystal) - c) });
                            if (s > 0 || w > 0 || c > 0) {
                                const gx = Math.floor(sx / 32) * 32 + 16;
                                const gy = Math.floor(sy / 32) * 32 + 16;
                                db.ref('blocks/' + gx + '_' + gy).set({ x: gx, y: gy, type: 'drop', stone: s, wood: w, crystal: c });
                            }
                        } else {
                            db.ref('players/' + pid).update({ hp: newHp });
                        }
                    });
                    return;
                }
            }

            let totemAt = null, tk = null;
            for (const k in this.totemsData) {
                const t = this.totemsData[k];
                if (t && Phaser.Math.Distance.Between(gridX, gridY, t.x, t.y) < 24) {
                    totemAt = t; tk = k; break;
                }
            }
            if (totemAt && tk) {
                if (this.myTribeId === tk || totemAt.ownerId === this.myId) {
                    if (confirm(`돌 ${TOTEM_REPAIR_COST}개로 토템 HP +${TOTEM_REPAIR_AMOUNT} 수리하시겠습니까?`)) {
                        db.ref('players/' + this.myId).once('value', (snap) => {
                            const p = snap.val();
                            if (!p) return;
                            const s = safeNum(p.stone);
                            if (s < TOTEM_REPAIR_COST) { this.showToast("돌이 부족합니다."); return; }
                            db.ref('blocks/' + tk).transaction((cur) => {
                                if (!cur || cur.type !== 'totem') return;
                                const nhp = Math.min(10000, safeNum(cur.hp, 10000) + TOTEM_REPAIR_AMOUNT);
                                return { ...cur, hp: nhp };
                            }).then((result) => {
                                if (result.committed) db.ref('players/' + this.myId).update({ stone: s - TOTEM_REPAIR_COST });
                            });
                        });
                    }
                } else {
                    if (confirm("이 부족에 충성을 맹세하시겠습니까?")) {
                        db.ref('players/' + this.myId).update({ tribeId: tk, tribeColor: totemAt.color });
                        this.myTribeId = tk; this.myTribeColor = totemAt.color;
                        this.syncUserDataForOffline({ tribeId: tk, tribeColor: totemAt.color });
                    } else {
                        db.ref('blocks/' + tk).transaction((cur) => {
                            if (!cur || cur.type !== 'totem') return;
                            const nhp = Math.max(0, safeNum(cur.hp, 10000) - FIST_TOTEM_DAMAGE);
                            if (nhp <= 0) {
                                db.ref('players').once('value', (s) => {
                                    const pl = s.val() || {};
                                    Object.keys(pl).forEach((pid) => {
                                        const pp = pl[pid];
                                        if (pp && pp.tribeId === tk) {
                                            db.ref('players/' + pid).update({ tribeId: null, tribeColor: null });
                                            if (pid === this.myId) this.syncUserDataForOffline({ tribeId: null, tribeColor: null });
                                        }
                                    });
                                });
                                return null;
                            }
                            return { ...cur, hp: nhp };
                        });
                    }
                }
                return;
            }

            db.ref('blocks/' + blockKey).once('value', (snapshot) => {
                const existing = snapshot.val();
                if (existing && existing.type === 'tnt') {
                    this.triggerExplode(blockKey);
                    return;
                }
                if (existing && existing.type === 'door') {
                    if (Phaser.Math.Distance.Between(x, y, safeNum(existing.x), safeNum(existing.y)) > 20) return;
                    const isOpen = existing.openUntil && Date.now() < existing.openUntil;
                    const pwd = prompt(isOpen ? "🚪 문을 닫으시겠습니까? 비밀번호:" : "🚪 비밀번호를 입력하세요:");
                    if (pwd !== null && pwd === existing.password) {
                        db.ref('blocks/' + blockKey).update({ openUntil: isOpen ? 0 : Date.now() + 15000 });
                    } else if (pwd !== null) this.showToast("❌ 비밀번호가 틀렸습니다.");
                } else if (existing && existing.type === 'sign') {
                    const newText = prompt("📜 표지판 기록:", existing.text || "");
                    if (newText !== null && newText !== existing.text) db.ref('blocks/' + blockKey).update({ text: newText });
                } else if (existing && existing.type === 'shop') {
                    if (Phaser.Math.Distance.Between(x, y, safeNum(existing.x), safeNum(existing.y)) > 24) return;
                    this.handleShopClick(blockKey, existing);
                } else if (existing && existing.type === 'drop') {
                    const stone = safeNum(existing.stone), wood = safeNum(existing.wood), crystal = safeNum(existing.crystal);
                    if (stone <= 0 && wood <= 0 && crystal <= 0) return;
                    db.ref('blocks/' + blockKey).remove();
                    db.ref('players/' + this.myId).once('value', (psnap) => {
                        const p = psnap.val();
                        if (!p) return;
                        const up = { stone: safeNum(p.stone) + stone, wood: safeNum(p.wood) + wood };
                        if (crystal > 0) up.crystal = safeNum(p.crystal) + crystal;
                        db.ref('players/' + this.myId).update(up);
                    });
                } else if (existing && (existing.type === 'rock' || existing.type === 'tree')) {
                    const res = existing.type === 'rock' ? 'stone' : 'wood';
                    this.gatherProgress[blockKey] = (this.gatherProgress[blockKey] || 0) + 1;
                    if (this.gatherProgress[blockKey] >= 2) {
                        this.gatherProgress[blockKey] = 0;
                        db.ref('blocks/' + blockKey).transaction((cur) => {
                            if (!cur || safeNum(cur.remaining) <= 0) return;
                            return { ...cur, remaining: Math.max(0, cur.remaining - 1) };
                        }).then((r) => {
                            const val = r.snapshot && r.snapshot.val();
                            if (!r.committed || !val) return;
                            const remain = safeNum(val.remaining);
                            if (remain >= 0) {
                                db.ref('players/' + this.myId).once('value', (snap) => {
                                    const p = snap.val();
                                    if (!p) return;
                                    const up = {}; up[res] = safeNum(p[res]) + 1;
                                    db.ref('players/' + this.myId).update(up);
                                });
                            }
                            if (remain <= 0) db.ref('blocks/' + blockKey).remove();
                        });
                    }
                } else if (existing && existing.type === 'crystal') {
                    this.gatherProgress[blockKey] = (this.gatherProgress[blockKey] || 0) + 1;
                    if (this.gatherProgress[blockKey] >= 2) {
                        this.gatherProgress[blockKey] = 0;
                        db.ref('blocks/' + blockKey).transaction((cur) => {
                            if (!cur || safeNum(cur.remaining) <= 0) return;
                            return { ...cur, remaining: Math.max(0, cur.remaining - 1) };
                        }).then((r) => {
                            const val = r.snapshot && r.snapshot.val();
                            if (!r.committed || !val) return;
                            const remain = safeNum(val.remaining);
                            if (remain >= 0) {
                                db.ref('players/' + this.myId).once('value', (snap) => {
                                    const p = snap.val();
                                    if (!p) return;
                                    const c = safeNum(p.crystal) + 1;
                                    db.ref('players/' + this.myId).update({ crystal: c });
                                });
                            }
                            if (remain <= 0) db.ref('blocks/' + blockKey).remove();
                        });
                    }
                } else if (!existing) {
                    if (!canBuildHere(gridX, gridY)) {
                        this.showToast("감옥 구역에서는 건설할 수 없습니다.");
                        return;
                    }
                    const totem = getTotemAt(gridX, gridY);
                    if (totem && !isOwnerOrCitizenOf(totem)) {
                        this.showToast("이 영토에서 건설할 권한이 없습니다.");
                        return;
                    }
                    const costMap = { wall: [1,0,0], sign: [0,1,0], door: [0,1,0], totem: [100,100,0], tnt: [TNT_COST_STONE,TNT_COST_WOOD,TNT_COST_HP], shop: [0,20,0] };
                    const c = costMap[this.currentMaterial] || [0,0,0];
                    const cost = { stone: c[0], wood: c[1], hp: c[2] };
                    if (cost.stone > 0 || cost.wood > 0 || cost.hp > 0) {
                        db.ref('players/' + this.myId).once('value', (snap) => {
                            const p = snap.val();
                            if (!p) return;
                            const s = safeNum(p.stone), w = safeNum(p.wood), h = safeNum(p.hp, 100);
                            if (s < cost.stone || w < cost.wood || h < cost.hp) {
                                this.showToast("재료가 부족합니다.");
                                return;
                            }
                            if (this.currentMaterial === 'door') {
                                const pwd = prompt("🚪 이 문의 비밀번호는? (예: 1234)");
                                if (pwd !== null && pwd.trim() !== "") {
                                    db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'door', password: pwd.trim() });
                                    db.ref('players/' + this.myId).update({ stone: s - cost.stone, wood: w - cost.wood });
                                }
                            } else if (this.currentMaterial === 'sign') {
                                const signText = prompt("🪧 이 표지판에 무엇을 기록하시겠습니까?");
                                if (signText !== null) {
                                    db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'sign', text: signText });
                                    db.ref('players/' + this.myId).update({ stone: s - cost.stone, wood: w - cost.wood });
                                }
                            } else if (this.currentMaterial === 'wall') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'wall' });
                                db.ref('players/' + this.myId).update({ stone: s - 1 });
                            } else if (this.currentMaterial === 'totem') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'totem', ownerId: this.myId, hp: 10000, color: this.myColor });
                                db.ref('players/' + this.myId).update({ stone: s - 100, wood: w - 100, tribeId: blockKey, tribeColor: this.myColor });
                                this.myTribeId = blockKey; this.myTribeColor = this.myColor;
                                this.syncUserDataForOffline({ tribeId: blockKey, tribeColor: this.myColor });
                            } else if (this.currentMaterial === 'tnt') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'tnt', placedAt: Date.now() });
                                db.ref('players/' + this.myId).update({ stone: s - cost.stone, wood: w - cost.wood, hp: h - cost.hp });
                            } else if (this.currentMaterial === 'shop') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'shop', ownerId: this.myId, stock: { resource: 'wood', amount: 0 }, price: { resource: 'stone', amount: 0 } });
                                db.ref('players/' + this.myId).update({ wood: w - 20 });
                            }
                        });
                    } else {
                        db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: this.currentMaterial });
                    }
                }
            });
        };

        gameContainer.addEventListener('mousedown', doBuildOrDelete, true);

        const onRightClick = (e) => {
            if (e.button !== 2) return;
            const container = document.getElementById('game-container');
            if (!container || !container.contains(e.target)) return;
            const rect = canvasEl.getBoundingClientRect();
            const cam = this.cameras.main;
            const scaleX = (cam.width / rect.width) || 1;
            const scaleY = (cam.height / rect.height) || 1;
            const worldX = (e.clientX - rect.left) * scaleX + cam.scrollX;
            const worldY = (e.clientY - rect.top) * scaleY + cam.scrollY;
            for (const id in this.players) {
                if (id === this.myId) continue;
                const p = this.players[id];
                if (p && p.active && Phaser.Math.Distance.Between(worldX, worldY, p.x, p.y) < 30) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.showReputationMenu(id);
                    return;
                }
            }
        };
        window.addEventListener('mousedown', onRightClick, true);

        /* V16: 이모티콘 버튼 클릭 연동 */
        document.querySelectorAll('.emoticon-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const emoji = btn.getAttribute('data-emoticon');
                if (!emoji) return;
                this.showEmoticonAbovePlayer(this.myPlayer, emoji, this.myId);
                db.ref('players/' + this.myId).update({ emoticon: emoji, emoticonTime: Date.now() });
            });
        });

        /* V17: 펫/모자 커스터마이징 버튼 클릭 연동 */
        document.querySelectorAll('.customization-btn[data-pet]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-pet') === 'none' ? null : btn.getAttribute('data-pet');
                db.ref('players/' + this.myId).update({ petType: val });
                this.syncUserDataForOffline({ petType: val });
                this.showToast(val ? `펫: ${val}` : "펫 해제");
                document.querySelectorAll('.customization-btn[data-pet]').forEach((b) => b.classList.remove('active'));
                if (val) btn.classList.add('active');
            });
        });
        document.querySelectorAll('.customization-btn[data-hat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute('data-hat') === 'none' ? null : btn.getAttribute('data-hat');
                db.ref('players/' + this.myId).update({ hatType: val });
                this.showToast(val ? `모자: ${val}` : "모자 해제");
                document.querySelectorAll('.customization-btn[data-hat]').forEach((b) => b.classList.remove('active'));
                if (val) btn.classList.add('active');
            });
        });

        /* V17: 진입 시 한 번 안내 토스트 */
        if (!sessionStorage.getItem('fw_customization_toast')) {
            sessionStorage.setItem('fw_customization_toast', '1');
            this.time.delayedCall(1800, () => {
                this.showToast("/pet koala로 펫을, /hat fedora로 모자를 바꿔보세요");
            });
        }

        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && chatInput.value.trim() !== "") {
                    const msg = chatInput.value.trim();
                    if (msg.startsWith('/shout ')) {
                        const shoutMsg = msg.slice(7).trim();
                        if (shoutMsg === "") { chatInput.value = ""; return; }
                        db.ref('players/' + this.myId).once('value', (snap) => {
                            const p = snap.val();
                            if (!p) return;
                            const s = safeNum(p.stone);
                            if (s < SHOUT_COST) { this.showToast("확성기를 쓸 돌이 부족합니다."); return; }
                            db.ref('server/announcement').set({ message: shoutMsg, author: this.myNickname, timestamp: Date.now() });
                            db.ref('players/' + this.myId).update({ stone: s - SHOUT_COST });
                        });
                    } else if (msg.startsWith('/pet ') || msg === '/pet') {
                        const type = (msg.startsWith('/pet ') ? msg.slice(5).trim().toLowerCase() : '');
                        const valid = ['koala', 'alpaca', 'gecko'];
                        const val = (valid.includes(type) ? type : (type === 'none' || type === '' ? null : null));
                        if (type && !valid.includes(type)) { this.showToast("koala, alpaca, gecko 중 선택"); }
                        else {
                            db.ref('players/' + this.myId).update({ petType: val });
                            this.syncUserDataForOffline({ petType: val });
                            this.showToast(val ? `펫: ${val}` : "펫 해제");
                        }
                    } else if (msg.startsWith('/hat ') || msg === '/hat') {
                        const type = (msg.startsWith('/hat ') ? msg.slice(5).trim().toLowerCase() : '');
                        const val = (type === 'fedora' ? 'fedora' : (type === 'none' || type === '' ? null : null));
                        db.ref('players/' + this.myId).update({ hatType: val });
                        this.showToast(val ? `모자: ${val}` : "모자 해제");
                    } else if (msg.startsWith('/color ')) {
                        const hex = msg.slice(7).trim();
                        const m = hex.match(/^#?([0-9A-Fa-f]{6})$/);
                        if (m) {
                            const rgb = parseInt(m[1], 16);
                            db.ref('players/' + this.myId).update({ color: rgb });
                            this.showToast("색상 변경됨");
                        } else this.showToast("형식: /color #FF0000");
                    } else {
                        db.ref('players/' + this.myId).update({ chat: msg, chatTime: firebase.database.ServerValue.TIMESTAMP });
                        const myDisp = (this.myReputation <= -10 ? '😈 ' : '') + this.myNickname;
                        const myFill = this.myReputation >= 10 ? '#FFD700' : this.myReputation <= -10 ? '#FF0000' : '#fff';
                        this.showChatBubble(this.myText, msg, myDisp, myFill);
                    }
                    chatInput.value = "";
                    this.sys.game.canvas.focus();
                }
            });
        }

        db.ref('server/announcement').on('value', (snap) => {
            const d = snap.val();
            if (d && d.message) this.showAnnouncement(d.message, d.author);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'e' && document.activeElement?.id !== 'chat-input') {
                e.preventDefault();
                const s = parseInt(prompt("떨어뜨릴 돌 개수:", "0") || "0", 10);
                const w = parseInt(prompt("떨어뜨릴 나무 개수:", "0") || "0", 10);
                const c = parseInt(prompt("떨어뜨릴 수정 개수:", "0") || "0", 10);
                if ((s > 0 || w > 0 || c > 0) && s >= 0 && w >= 0 && c >= 0) {
                    db.ref('players/' + this.myId).once('value', (snap) => {
                        const p = snap.val();
                        if (!p) return;
                        const ms = Math.min(s, safeNum(p.stone)), mw = Math.min(w, safeNum(p.wood)), mc = Math.min(c, safeNum(p.crystal));
                        if (ms > 0 || mw > 0 || mc > 0) {
                            const gx = Math.floor(this.myPlayer.x / 32) * 32 + 16;
                            const gy = Math.floor(this.myPlayer.y / 32) * 32 + 16;
                            db.ref('blocks/' + gx + '_' + gy).set({ x: gx, y: gy, type: 'drop', stone: ms, wood: mw, crystal: mc });
                            db.ref('players/' + this.myId).update({ stone: safeNum(p.stone) - ms, wood: safeNum(p.wood) - mw, crystal: safeNum(p.crystal) - mc });
                        }
                    });
                }
            }
        });

        this.time.addEvent({
            delay: 50, loop: true,
            callback: () => {
                const v = this.myPlayer.body.velocity;
                if (v.x !== 0 || v.y !== 0) db.ref('players/' + this.myId).update({ x: this.myPlayer.x, y: this.myPlayer.y });
                this.myText.x = this.myPlayer.x;
                this.myText.y = this.myPlayer.y - 35;
                this.drawHpBar(this.myHpBar, this.myPlayer.x, this.myPlayer.y - 28, safeNum(this.myHp, 100), 100);
                if (this.myHatSprite) { this.myHatSprite.x = this.myPlayer.x; this.myHatSprite.y = this.myPlayer.y - 18; }
                if (this.myEmoticonText) { this.myEmoticonText.x = this.myPlayer.x; this.myEmoticonText.y = this.myPlayer.y - 50; }
            }
        });

        db.ref('players/' + this.myId).on('value', (s) => {
            const d = s.val();
            if (!d) return;
            const prevHp = this.myHp;
            this.myHp = safeNum(d.hp, 100);
            this.myStone = safeNum(d.stone);
            this.myWood = safeNum(d.wood);
            this.myCrystal = safeNum(d.crystal);
            this.myPetHunger = safeNum(d.petHunger, 0);
            this.myTribeId = safeVal(d.tribeId);
            this.myTribeColor = safeVal(d.tribeColor);
            this.myPlayer.setTint(d.tribeColor || d.color || this.myColor);
            if (ui.myStone) ui.myStone.innerText = this.myStone;
            if (ui.myWood) ui.myWood.innerText = this.myWood;
            if (ui.myCrystal) ui.myCrystal.innerText = this.myCrystal;
            this.myIsJailed = !!(d.isJailed);
            this.myJailedUntil = safeNum(d.jailedUntil, 0);
            /* 자체 위치: 감옥·리스폰 시에만 서버 좌표 적용. 일반 이동 시 덮어쓰기 안 함 (우측 이동 끊김 방지) */
            if (d.x !== undefined && d.y !== undefined) {
                if (this.myIsJailed && this.myJailedUntil > 0) {
                    this.myPlayer.x = d.x; this.myPlayer.y = d.y;
                } else if (prevHp < 50 && this.myHp >= 100) {
                    this.myPlayer.x = d.x; this.myPlayer.y = d.y;  /* 리스폰 */
                }
            }
            this.syncMyPetAndHat(safeVal(d.petType), safeVal(d.hatType), d.tribeColor || d.color || this.myColor);
            /* V17: 펫/모자 버튼 active 상태 동기화 */
            const petType = safeVal(d.petType);
            const hatType = safeVal(d.hatType);
            document.querySelectorAll('.customization-btn[data-pet]').forEach((b) => {
                b.classList.toggle('active', b.getAttribute('data-pet') === (petType || 'none'));
            });
            document.querySelectorAll('.customization-btn[data-hat]').forEach((b) => {
                b.classList.toggle('active', b.getAttribute('data-hat') === (hatType || 'none'));
            });
            const rep = safeNum(d.reputation);
            this.myReputation = rep;
            const myDisplayName = (rep <= -10 ? '😈 ' : '') + (d.nickname || this.myNickname);
            this.myText.setText(myDisplayName);
            if (rep >= 10) this.myText.setStyle({ fill: '#FFD700', backgroundColor: '#00000088' });
            else if (rep <= -10) this.myText.setStyle({ fill: '#FF0000', backgroundColor: '#00000088' });
            else this.myText.setStyle({ fill: '#fff', backgroundColor: '#00000088' });
        });
        db.ref('players').on('child_added', (s) => this.handlePlayerUpdate(s, 'add'));
        db.ref('players').on('child_changed', (s) => this.handlePlayerUpdate(s, 'change'));
        db.ref('players').on('child_removed', (s) => {
            const id = s.key;
            this.destroyPlayerPetAndHat(id);
            if (this.players[id]) {
                this.otherPlayersGroup.remove(this.players[id], false, false);
                this.players[id].destroy();
                delete this.players[id];
            }
            if (this.playerTexts[id]) { this.playerTexts[id].destroy(); delete this.playerTexts[id]; }
            if (this.playerHpBars[id]) { this.playerHpBars[id].destroy(); delete this.playerHpBars[id]; }
            if (this.playerEmoticonTexts[id]) { this.playerEmoticonTexts[id].destroy(); delete this.playerEmoticonTexts[id]; }
            delete this.playerLastEmoticonTime[id];
        });

        db.ref('blocks').on('child_added', (s) => this.createBlock(s.key, s.val()));
        db.ref('blocks').on('child_changed', (s) => {
            const key = s.key;
            if (this.prisonBlockKeys && this.prisonBlockKeys.has(key)) return; /* V14: 감옥 벽은 DB와 무관 */
            const data = s.val();
            if (!data) return;
            if (data.type === 'totem') this.totemsData[key] = { x: data.x, y: data.y, ownerId: data.ownerId, hp: safeNum(data.hp, 10000), color: data.color || 0xFFD700 };
            this.removeBlock(key);
            this.createBlock(key, data);
        });
        db.ref('blocks').on('child_removed', (s) => {
            const key = s.key;
            if (this.prisonBlockKeys && this.prisonBlockKeys.has(key)) return; /* V14: 감옥 벽은 DB와 무관 */
            if (this.totemsData[key]) {
                db.ref('players').once('value', (snap) => {
                    const pl = snap.val() || {};
                    Object.keys(pl).forEach((pid) => {
                        const pp = pl[pid];
                        if (pp && pp.tribeId === key) {
                            db.ref('players/' + pid).update({ tribeId: null, tribeColor: null });
                            if (pid === this.myId) this.syncUserDataForOffline({ tribeId: null, tribeColor: null });
                        }
                    });
                });
            }
            this.removeBlock(key);
        });

        /* onDisconnect().remove()는 loadUserDataAndCatchUp에서 설정됨 */
    }

    syncMyPetAndHat(petType, hatType, displayColor) {
        if (petType !== this.myPetType) {
            if (this.myPetSprite) { this.myPetSprite.destroy(); this.myPetSprite = null; }
            this.myPetType = petType;
            if (petType && ['koala', 'alpaca', 'gecko'].includes(petType)) {
                this.myPetSprite = this.add.sprite(this.myPlayer.x, this.myPlayer.y, 'pet_' + petType);
                this.myPetSprite.setDepth(9); this.myPetSprite.setScale(0.6);
            }
        }
        if (hatType !== this.myHatType) {
            if (this.myHatSprite) { this.myHatSprite.destroy(); this.myHatSprite = null; }
            this.myHatType = hatType;
            if (hatType === 'fedora') {
                this.myHatSprite = this.add.sprite(this.myPlayer.x, this.myPlayer.y - 18, 'hat_fedora');
                this.myHatSprite.setDepth(11); this.myHatSprite.setScale(0.7);
            }
        }
        if (this.myHatSprite) { this.myHatSprite.x = this.myPlayer.x; this.myHatSprite.y = this.myPlayer.y - 18; }
    }

    /** V17: userData 동기화 (오프라인 시뮬레이션용). overrides로 즉시 반영된 값 전달 가능 */
    syncUserDataForOffline(overrides = {}) {
        db.ref('userData/' + this.myId).update({
            petType: overrides.petType ?? this.myPetType,
            petHunger: overrides.petHunger ?? this.myPetHunger,
            tribeId: overrides.tribeId ?? this.myTribeId,
            tribeColor: overrides.tribeColor ?? this.myTribeColor,
            stone: overrides.stone ?? this.myStone,
            wood: overrides.wood ?? this.myWood,
            crystal: overrides.crystal ?? this.myCrystal,
            hp: overrides.hp ?? this.myHp,
            reputation: overrides.reputation ?? this.myReputation,
            hatType: overrides.hatType ?? this.myHatType
        });
    }

    showToast(msg) {
        this.showTradeEffect(msg);
    }

    triggerExplode(blockKey) {
        if (this.explodingBlocks.has(blockKey)) return;
        this.explodingBlocks.add(blockKey);

        if (this.tntTimers[blockKey]) { this.tntTimers[blockKey].remove(); delete this.tntTimers[blockKey]; }
        const block = this.blocks[blockKey];
        const parts = blockKey.split('_');
        const ex = block ? block.x : (parseInt(parts[0], 10) || 16);
        const ey = block ? block.y : (parseInt(parts[1], 10) || 16);
        db.ref('blocks/' + blockKey).remove();

        const done = () => { this.explodingBlocks.delete(blockKey); };

        db.ref('blocks').once('value', (snap) => {
            const all = snap.val() || {};
            Object.keys(all).forEach((key) => {
                if (key === blockKey) return;
                const b = all[key];
                if (!b || !['wall', 'door', 'sign', 'tnt', 'shop'].includes(b.type)) return;
                const dist = Phaser.Math.Distance.Between(ex, ey, safeNum(b.x), safeNum(b.y));
                if (dist <= TNT_EXPLODE_RADIUS) db.ref('blocks/' + key).remove();
            });
        });

        for (const k in this.totemsData) {
            const t = this.totemsData[k];
            if (!t) continue;
            const dist = Phaser.Math.Distance.Between(ex, ey, t.x, t.y);
            if (dist <= TNT_EXPLODE_RADIUS) {
                db.ref('blocks/' + k).transaction((cur) => {
                    if (!cur || cur.type !== 'totem') return;
                    const nhp = Math.max(0, safeNum(cur.hp, 10000) - TNT_TOTEM_DAMAGE);
                    if (nhp <= 0) {
                        db.ref('players').once('value', (s) => {
                            const pl = s.val() || {};
                            Object.keys(pl).forEach((pid) => {
                                const pp = pl[pid];
                                if (pp && pp.tribeId === k) {
                                    db.ref('players/' + pid).update({ tribeId: null, tribeColor: null });
                                    if (pid === this.myId) this.syncUserDataForOffline({ tribeId: null, tribeColor: null });
                                }
                            });
                        });
                        return null;
                    }
                    return { ...cur, hp: nhp };
                });
            }
        }

        db.ref('players').once('value', (snap) => {
            const pl = snap.val() || {};
            Object.keys(pl).forEach((pid) => {
                const d = pl[pid];
                if (!d) return;
                if (this.myTribeId && d.tribeId === this.myTribeId) return;
                const dist = Phaser.Math.Distance.Between(ex, ey, safeNum(d.x), safeNum(d.y));
                if (dist <= TNT_EXPLODE_RADIUS) {
                    const nhp = Math.max(0, safeNum(d.hp, 100) - TNT_PLAYER_DAMAGE);
                    if (nhp <= 0) {
                        const stx = Math.floor(WORLD_WIDTH / 32), sty = Math.floor(WORLD_HEIGHT / 32);
                        let rx = Math.floor(Math.random() * stx) * 32 + 16, ry = Math.floor(Math.random() * sty) * 32 + 16;
                        for (let i = 0; i < 10; i++) {
                            if (!(rx >= PRISON_GRID_MIN && rx <= PRISON_GRID_MAX && ry >= PRISON_GRID_MIN && ry <= PRISON_GRID_MAX)) break;
                            rx = Math.floor(Math.random() * stx) * 32 + 16;
                            ry = Math.floor(Math.random() * sty) * 32 + 16;
                        }
                        const s = Math.floor(safeNum(d.stone) * 0.5);
                        const w = Math.floor(safeNum(d.wood) * 0.5);
                        const c = Math.floor(safeNum(d.crystal) * 0.5);
                        db.ref('players/' + pid).update({ x: rx, y: ry, hp: 100, stone: Math.max(0, safeNum(d.stone) - s), wood: Math.max(0, safeNum(d.wood) - w), crystal: Math.max(0, safeNum(d.crystal) - c) });
                        if (s > 0 || w > 0 || c > 0) {
                            const gx = Math.floor((d.x || 0) / 32) * 32 + 16;
                            const gy = Math.floor((d.y || 0) / 32) * 32 + 16;
                            db.ref('blocks/' + gx + '_' + gy).set({ x: gx, y: gy, type: 'drop', stone: s, wood: w, crystal: c });
                        }
                    } else {
                        db.ref('players/' + pid).update({ hp: nhp });
                    }
                }
            });
            done();
        });
        setTimeout(done, 500);

        this.cameras.main.shake(300, 0.01);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const fx = this.add.circle(ex + Math.cos(angle) * 20, ey + Math.sin(angle) * 20, 6, 0xFF6600, 0.9);
            this.tweens.add({ targets: fx, scaleX: 2, scaleY: 2, alpha: 0, duration: 400, onComplete: () => fx.destroy() });
        }
    }

    maybeSpawnResources() {
        db.ref('blocks').once('value', (snap) => {
            const v = snap.val() || {};
            const arr = Object.values(v);
            const rockCnt = arr.filter((b) => b && b.type === 'rock').length;
            const treeCnt = arr.filter((b) => b && b.type === 'tree').length;
            const rockNeed = Math.max(0, ROCK_TARGET - rockCnt);
            const treeNeed = Math.max(0, TREE_TARGET - treeCnt);
            if (rockNeed > 0 || treeNeed > 0) this.spawnResources(rockNeed, treeNeed);
        });
    }

    spawnResources(rockNeed, treeNeed) {
        const positions = [];
        const tilesX = Math.floor(WORLD_WIDTH / 32), tilesY = Math.floor(WORLD_HEIGHT / 32);
        for (let gx = 0; gx < tilesX; gx++) for (let gy = 0; gy < tilesY; gy++) {
            const px = gx * 32 + 16, py = gy * 32 + 16;
            if (px >= PRISON_GRID_MIN && px <= PRISON_GRID_MAX && py >= PRISON_GRID_MIN && py <= PRISON_GRID_MAX) continue; /* V14: 감옥 구역 제외 */
            positions.push({ x: px, y: py, key: px + '_' + py });
        }
        Phaser.Utils.Array.Shuffle(positions);
        positions.forEach((p, i) => {
            if (i < rockNeed) {
                db.ref('blocks/' + p.key).transaction((cur) => (!cur ? { x: p.x, y: p.y, type: 'rock', remaining: REMAINING_PER } : undefined));
            } else if (i < rockNeed + treeNeed) {
                db.ref('blocks/' + p.key).transaction((cur) => (!cur ? { x: p.x, y: p.y, type: 'tree', remaining: REMAINING_PER } : undefined));
            }
        });
    }

    createBlock(key, data) {
        if (!data) return;
        if (this.prisonBlockKeys && this.prisonBlockKeys.has(key)) return; /* V14: 감옥 벽은 DB에서 덮어쓰지 않음 */
        this.removeBlock(key);
        let block;
        if (data.type === 'wall' || !data.type) {
            block = this.wallGroup.create(data.x, data.y, 'wall');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
        } else if (data.type === 'grass') {
            block = this.floorGroup.create(data.x, data.y, 'grass');
            block.setDepth(0);
        } else if (data.type === 'water') {
            block = this.floorGroup.create(data.x, data.y, 'water');
            block.setDepth(0);
        } else if (data.type === 'sign') {
            block = this.signGroup.create(data.x, data.y, 'sign');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
        } else if (data.type === 'door') {
            block = this.doorGroup.create(data.x, data.y, 'door');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
            this.doorKeys.add(key);
            this.doorOpenUntil[key] = data.openUntil || 0;
        } else if (data.type === 'tnt') {
            block = this.tntGroup.create(data.x, data.y, 'tnt');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
            block.setData('type', 'tnt');
            const placedAt = data.placedAt || Date.now();
            const delay = Math.max(0, TNT_EXPLODE_DELAY - (Date.now() - placedAt));
            this.tntTimers[key] = this.time.delayedCall(delay, () => this.triggerExplode(key));
        } else if (data.type === 'rock') {
            block = this.resourceGroup.create(data.x, data.y, 'rock');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
        } else if (data.type === 'crystal') {
            block = this.resourceGroup.create(data.x, data.y, 'crystal');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
        } else if (data.type === 'tree') {
            block = this.resourceGroup.create(data.x, data.y, 'tree');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
        } else if (data.type === 'drop') {
            const txt = '🪨' + safeNum(data.stone) + ' 🪵' + safeNum(data.wood) + (safeNum(data.crystal) > 0 ? ' 💎' + safeNum(data.crystal) : '');
            block = this.add.container(data.x, data.y, [
                this.add.image(0, 0, 'drop'),
                this.add.text(0, -8, txt, { fontSize: '8px', fill: '#fff' }).setOrigin(0.5)
            ]);
            block.setDepth(5);
            this.dropGroup.add(block);
        } else if (data.type === 'shop') {
            block = this.shopGroup.create(data.x, data.y, 'shop');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(5);
            const st = data.stock || { resource: 'wood', amount: 0 };
            const pr = data.price || { resource: 'stone', amount: 0 };
            const label = safeNum(st.amount) > 0 && safeNum(pr.amount) > 0
                ? `${st.resource === 'stone' ? '🪨' : '🪵'}${st.amount}→${pr.resource === 'stone' ? '🪨' : '🪵'}${pr.amount}`
                : '🏪';
            const txt = this.add.text(data.x, data.y - 18, label, { fontSize: '8px', fill: '#FFD700', backgroundColor: '#00000099' }).setOrigin(0.5).setDepth(6);
            this.shopLabels[key] = txt;
        } else if (data.type === 'totem') {
            block = this.totemGroup.create(data.x, data.y, 'totem');
            block.body.setSize(32, 32); block.body.updateFromGameObject(); block.refreshBody(); block.setDepth(6);
            block.setTint(data.color || 0xFFD700);
            this.totemsData[key] = { x: data.x, y: data.y, ownerId: data.ownerId, hp: safeNum(data.hp, 10000), color: data.color || 0xFFD700 };
        }
        if (block) this.blocks[key] = block;
    }

    removeBlock(key) {
        if (this.tntTimers[key]) { this.tntTimers[key].remove(); delete this.tntTimers[key]; }
        if (this.totemsData[key]) delete this.totemsData[key];
        if (this.shopLabels[key]) { this.shopLabels[key].destroy(); delete this.shopLabels[key]; }
        this.doorKeys.delete(key);
        delete this.doorOpenUntil[key];
        if (this.blocks[key]) {
            const block = this.blocks[key];
            const parent = block.getParent ? block.getParent() : block.parentContainer;
            if (parent && typeof parent.remove === 'function') parent.remove(block, false, false);
            block.destroy();
            delete this.blocks[key];
        }
    }

    handlePlayerUpdate(snapshot, type) {
        const id = snapshot.key;
        if (id === this.myId) return;
        const data = snapshot.val();
        if (!data) return;
        const hp = safeNum(data.hp, 100);
        const px = safeNum(data.x), py = safeNum(data.y);
        if (!this.players[id]) {
            this.players[id] = this.physics.add.sprite(px, py, 'dude');
            this.players[id].setDepth(10);
            this.players[id].setTint(data.tribeColor || data.color || 0xffffff);
            this.players[id].setCollideWorldBounds(true);
            this.players[id].setPushable(true);
            this.players[id].body.setSize(28, 32);
            this.players[id].body.setOffset(2, 0);
            this.otherPlayersGroup.add(this.players[id]);
            this.playerTexts[id] = this.add.text(px, py - 35, data.nickname || "익명", { fontSize: '12px', fill: '#fff', backgroundColor: '#00000088' }).setOrigin(0.5);
            this.playerHpBars[id] = this.add.graphics();
            this.playerPetData[id] = { petSprite: null, hatSprite: null, petType: null, hatType: null, petX: px, petY: py };
        }
        this.players[id].x = px;
        this.players[id].y = py;
        this.playerTexts[id].x = px;
        this.playerTexts[id].y = py - 35;
        if (hp <= 0) {
            this.players[id].setTexture('skull');
            this.players[id].clearTint();
        } else {
            this.players[id].setTexture('dude');
            this.players[id].setTint(data.tribeColor || data.color || 0xffffff);
        }
        /* V15: 펫 & 모자 동기화 */
        const petType = safeVal(data.petType);
        const hatType = safeVal(data.hatType);
        const pd = this.playerPetData[id];
        if (pd) {
            if (petType !== pd.petType) {
                if (pd.petSprite) { pd.petSprite.destroy(); pd.petSprite = null; }
                pd.petType = petType;
                if (petType && ['koala', 'alpaca', 'gecko'].includes(petType)) {
                    pd.petSprite = this.add.sprite(px, py, 'pet_' + petType);
                    pd.petSprite.setDepth(9); pd.petSprite.setScale(0.6);
                    pd.petX = px; pd.petY = py;
                }
            }
            if (hatType !== pd.hatType) {
                if (pd.hatSprite) { pd.hatSprite.destroy(); pd.hatSprite = null; }
                pd.hatType = hatType;
                if (hatType === 'fedora') {
                    pd.hatSprite = this.add.sprite(px, py - 18, 'hat_fedora');
                    pd.hatSprite.setDepth(11); pd.hatSprite.setScale(0.7);
                }
            }
            if (pd.hatSprite) { pd.hatSprite.x = px; pd.hatSprite.y = py - 18; }
        }
        this.drawHpBar(this.playerHpBars[id], px, py - 28, hp, 100);
        const rep = safeNum(data.reputation);
        const displayName = (rep <= -10 ? '😈 ' : '') + (data.nickname || "익명");
        this.playerTexts[id].setText(displayName);
        if (rep >= 10) this.playerTexts[id].setStyle({ fill: '#FFD700', backgroundColor: '#00000088' });
        else if (rep <= -10) this.playerTexts[id].setStyle({ fill: '#FF0000', backgroundColor: '#00000088' });
        else this.playerTexts[id].setStyle({ fill: '#fff', backgroundColor: '#00000088' });
        const fillColor = rep >= 10 ? '#FFD700' : rep <= -10 ? '#FF0000' : '#fff';
        if (data.chat && (type === 'change' || type === 'add')) this.showChatBubble(this.playerTexts[id], data.chat, displayName, fillColor);
        /* V16: 이모티콘 수신 — 다른 유저의 이모티콘 표시 */
        const emoticonTime = safeNum(data.emoticonTime, 0);
        if (data.emoticon && emoticonTime > 0 && this.playerLastEmoticonTime[id] !== emoticonTime) {
            if (Date.now() - emoticonTime < this.EMOTICON_DURATION + 500) {
                this.playerLastEmoticonTime[id] = emoticonTime;
                this.showEmoticonAbovePlayer(this.players[id], data.emoticon, id);
            }
        }
    }

    destroyPlayerPetAndHat(id) {
        const pd = this.playerPetData[id];
        if (pd) {
            if (pd.petSprite) { pd.petSprite.destroy(); pd.petSprite = null; }
            if (pd.hatSprite) { pd.hatSprite.destroy(); pd.hatSprite = null; }
            delete this.playerPetData[id];
        }
    }

    drawHpBar(g, x, y, hp, maxHp) {
        if (!g || !g.scene) return;
        g.clear();
        const w = 24, h = 4;
        g.fillStyle(0x333333, 0.8);
        g.fillRect(x - w / 2, y, w, h);
        const pct = Math.max(0, Math.min(1, hp / maxHp));
        g.fillStyle(pct > 0.5 ? 0x4CAF50 : pct > 0.25 ? 0xFFC107 : 0xF44336, 0.9);
        g.fillRect(x - w / 2, y, w * pct, h);
    }

    showEmoticonAbovePlayer(sprite, emoji, playerId) {
        const isMy = playerId === this.myId;
        const prev = isMy ? this.myEmoticonText : this.playerEmoticonTexts[playerId];
        if (prev) { prev.destroy(); if (isMy) this.myEmoticonText = null; else delete this.playerEmoticonTexts[playerId]; }
        const txt = this.add.text(sprite.x, sprite.y - 50, emoji, {
            fontSize: '24px',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { x: 6, y: 2 }
        }).setOrigin(0.5).setDepth(12);
        if (isMy) this.myEmoticonText = txt; else this.playerEmoticonTexts[playerId] = txt;
        this.time.delayedCall(this.EMOTICON_DURATION, () => {
            if (txt && txt.scene) txt.destroy();
            if (isMy) this.myEmoticonText = null; else delete this.playerEmoticonTexts[playerId];
        });
    }

    showChatBubble(textObj, msg, originalName, restoreFill = '#fff') {
        if (!textObj) return;
        textObj.setText(msg);
        textObj.setStyle({ backgroundColor: '#1a1a1d', fill: '#e8e8e8', fontStyle: 'italic' });
        textObj.setAlpha(0);
        textObj.setScale(0.85);
        this.tweens.add({
            targets: textObj,
            alpha: 1,
            scale: 1,
            duration: 200,
            ease: 'Back.easeOut'
        });
        setTimeout(() => {
            if (textObj && textObj.scene) {
                textObj.setText(originalName);
                textObj.setStyle({ backgroundColor: '#00000088', fill: restoreFill, fontStyle: 'normal' });
            }
        }, 3000);
    }

    showReputationMenu(targetId) {
        const menu = document.getElementById('reputation-menu');
        if (!menu) return;
        const player = this.players[targetId];
        if (!player) return;
        if (this.reputationMenuTimer) { clearTimeout(this.reputationMenuTimer); this.reputationMenuTimer = null; }
        const canvasEl = this.sys.game.canvas;
        const rect = canvasEl.getBoundingClientRect();
        const cam = this.cameras.main;
        const scaleX = rect.width / cam.width;
        const scaleY = rect.height / cam.height;
        const screenX = rect.left + (player.x - cam.scrollX) * scaleX;
        const screenY = rect.top + (player.y - cam.scrollY) * scaleY - 60;
        menu.style.display = 'flex';
        menu.style.left = Math.max(10, Math.min(window.innerWidth - 100, screenX - 40)) + 'px';
        menu.style.top = Math.max(10, Math.min(window.innerHeight - 60, screenY)) + 'px';
        const upBtn = menu.querySelector('.reputation-up');
        const downBtn = menu.querySelector('.reputation-down');
        const apply = (delta) => {
            db.ref('players/' + targetId).transaction((cur) => {
                if (!cur) return;
                const r = safeNum(cur.reputation);
                return { ...cur, reputation: r + delta };
            });
        };
        const hide = () => {
            if (this.reputationMenuTimer) { clearTimeout(this.reputationMenuTimer); this.reputationMenuTimer = null; }
            menu.style.display = 'none';
            if (upBtn) upBtn.onclick = null;
            if (downBtn) downBtn.onclick = null;
        };
        if (upBtn) upBtn.onclick = () => { apply(1); hide(); };
        if (downBtn) downBtn.onclick = () => { apply(-1); hide(); };
        this.reputationMenuTimer = setTimeout(hide, REPUTATION_DISPLAY_DURATION);
    }

    handleShopClick(blockKey, shopData) {
        const ownerId = safeVal(shopData.ownerId, '');
        const stock = shopData.stock || { resource: 'wood', amount: 0 };
        const price = shopData.price || { resource: 'stone', amount: 0 };
        const stockRes = stock.resource === 'stone' ? 'stone' : 'wood';
        const stockAmt = Math.max(0, safeNum(stock.amount));
        const priceRes = price.resource === 'stone' ? 'stone' : 'wood';
        const priceAmt = Math.max(0, safeNum(price.amount));
        const stockName = stockRes === 'stone' ? '돌' : '나무';
        const priceName = priceRes === 'stone' ? '돌' : '나무';

        if (ownerId === this.myId) {
            const oldStock = shopData.stock;
            const doConfig = () => {
                const sellRes = (prompt("판매할 자원(wood/stone):", stockRes) || '').toLowerCase().trim();
                if (sellRes !== 'wood' && sellRes !== 'stone') { this.showToast("wood 또는 stone만 입력하세요."); return; }
                const sellAmt = parseInt(prompt("판매 개수:", String(stockAmt || 1)) || "0", 10);
                if (isNaN(sellAmt) || sellAmt <= 0) { this.showToast("1 이상의 숫자를 입력하세요."); return; }
                const wantRes = (prompt("요구 가격 자원(wood/stone):", priceRes) || '').toLowerCase().trim();
                if (wantRes !== 'wood' && wantRes !== 'stone') { this.showToast("wood 또는 stone만 입력하세요."); return; }
                const wantAmt = parseInt(prompt("요구 가격 개수:", String(priceAmt || 1)) || "0", 10);
                if (isNaN(wantAmt) || wantAmt <= 0) { this.showToast("1 이상의 숫자를 입력하세요."); return; }
                db.ref('players/' + this.myId).once('value', (snap) => {
                    const p = snap.val();
                    if (!p) return;
                    const have = safeNum(p[sellRes]);
                    if (have < sellAmt) { this.showToast(`${sellRes === 'stone' ? '돌' : '나무'}이(가) 부족합니다.`); return; }
                    db.ref('blocks/' + blockKey).update({
                        stock: { resource: sellRes, amount: sellAmt },
                        price: { resource: wantRes, amount: wantAmt }
                    });
                    db.ref('players/' + this.myId).update({ [sellRes]: have - sellAmt });
                    this.showTradeEffect('가판대 설정 완료');
                });
            };
            if (oldStock && safeNum(oldStock.amount) > 0) {
                const oldRes = oldStock.resource === 'stone' ? 'stone' : 'wood';
                const oldAmt = safeNum(oldStock.amount);
                db.ref('players/' + this.myId).once('value').then((snap) => {
                    const p = snap.val();
                    if (!p) return Promise.resolve();
                    const cur = safeNum(p[oldRes]);
                    return db.ref('players/' + this.myId).update({ [oldRes]: cur + oldAmt });
                }).then(() => doConfig()).catch(() => doConfig());
            } else {
                doConfig();
            }
            return;
        }

        if (!ownerId || stockAmt <= 0 || priceAmt <= 0) {
            this.showToast("이 가판대에는 판매 물품이 없습니다.");
            return;
        }
        if (!confirm(`${stockName} ${stockAmt}개를 ${priceName} ${priceAmt}개에 사시겠습니까?`)) return;
        db.ref('players/' + this.myId).once('value', (snap) => {
            const buyer = snap.val();
            if (!buyer) return;
            const myPrice = safeNum(buyer[priceRes]);
            if (myPrice < priceAmt) {
                this.showToast(`${priceName}이(가) 부족합니다.`);
                return;
            }
            db.ref('blocks/' + blockKey).transaction((cur) => {
                if (!cur || cur.type !== 'shop') return;
                const st = cur.stock || { resource: 'wood', amount: 0 };
                const amt = safeNum(st.amount);
                if (amt < stockAmt) return;
                return { ...cur, stock: { ...st, amount: Math.max(0, amt - stockAmt) } };
            }).then((r) => {
                if (!r.committed || !r.snapshot.val()) { this.showToast("거래 실패 (재고 부족)"); return; }
                db.ref('players/' + this.myId).update({
                    [priceRes]: safeNum(buyer[priceRes]) - priceAmt,
                    [stockRes]: safeNum(buyer[stockRes]) + stockAmt
                });
                db.ref('players/' + ownerId).once('value', (snap) => {
                    const seller = snap.val() || {};
                    db.ref('players/' + ownerId).update({
                        [priceRes]: safeNum(seller[priceRes]) + priceAmt
                    });
                });
                this.showTradeEffect('거래 완료!');
            });
        });
    }

    showTradeEffect(msg) {
        const box = document.getElementById('trade-success-box');
        if (box) {
            box.textContent = msg;
            box.classList.add('trade-success-show');
            clearTimeout(this.tradeEffectTimer);
            this.tradeEffectTimer = setTimeout(() => {
                box.classList.remove('trade-success-show');
            }, 2000);
        }
    }

    showAnnouncement(msg, author) {
        const box = document.getElementById('announcement-box');
        if (!box) return;
        box.textContent = (author ? `📢 ${author}: ` : '📢 ') + msg;
        box.style.display = 'block';
        if (this.announcementTimer) clearTimeout(this.announcementTimer);
        this.announcementTimer = setTimeout(() => {
            box.textContent = '';
            box.style.display = 'none';
            this.announcementTimer = null;
        }, ANNOUNCEMENT_DURATION);
    }

    /* V18: 날씨 시각 효과 — 파티클 & 필터 */
    updateWeatherEffects() {
        if (this.weatherEmitter) { this.weatherEmitter.destroy(); this.weatherEmitter = null; }
        if (this.weatherParticles) { this.weatherParticles.destroy(); this.weatherParticles = null; }
        document.getElementById('weather-acid-overlay')?.remove();
        document.getElementById('weather-snow-overlay')?.remove();

        const cam = this.cameras.main;
        const snowBiome = this.myPlayer && this.myPlayer.y < BIOME_SNOW_Y;
        const desertBiome = this.myPlayer && this.myPlayer.x > BIOME_DESERT_X;

        if (this.weather === 'acid_rain') {
            this.weatherParticles = this.add.particles('pixel');
            this.weatherEmitter = this.weatherParticles.createEmitter({
                x: { min: cam.scrollX - 50, max: cam.scrollX + cam.width + 50 },
                y: cam.scrollY - 20,
                lifespan: 700,
                speedY: { min: 200, max: 300 },
                scale: { start: 0.5, end: 0 },
                quantity: 3,
                frequency: 35,
                tint: 0x00ff00
            });
            if (this.weatherParticles) this.weatherParticles.setScrollFactor(0);
            this.weatherEmitter.setDepth(9998);
            const overlay = document.createElement('div');
            overlay.id = 'weather-acid-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;background:rgba(0,80,0,0.12);';
            document.getElementById('game-container')?.appendChild(overlay);
        } else if (snowBiome) {
            this.weatherParticles = this.add.particles('pixel');
            this.weatherEmitter = this.weatherParticles.createEmitter({
                x: { min: cam.scrollX - 30, max: cam.scrollX + cam.width + 30 },
                y: cam.scrollY - 10,
                lifespan: 1200,
                speedY: { min: 40, max: 80 },
                speedX: { min: -20, max: 20 },
                scale: { start: 0.6, end: 0 },
                quantity: 1,
                frequency: 60,
                tint: 0xffffff
            });
            if (this.weatherParticles) this.weatherParticles.setScrollFactor(0);
            this.weatherEmitter.setDepth(9998);
            const frostOverlay = document.createElement('div');
            frostOverlay.id = 'weather-snow-overlay';
            frostOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;background:radial-gradient(ellipse at center, transparent 50%, rgba(255,255,255,0.08) 100%);';
            document.getElementById('game-container')?.appendChild(frostOverlay);
        } else if (this.weather === 'rain') {
            this.weatherParticles = this.add.particles('pixel');
            this.weatherEmitter = this.weatherParticles.createEmitter({
                x: { min: cam.scrollX - 50, max: cam.scrollX + cam.width + 50 },
                y: cam.scrollY - 20,
                lifespan: 800,
                speedY: { min: 180, max: 280 },
                scale: { start: 0.4, end: 0 },
                quantity: 2,
                frequency: 40,
                blendMode: 'ADD'
            });
            if (this.weatherParticles) this.weatherParticles.setScrollFactor(0);
            this.weatherEmitter.setDepth(9998);
        } else if (desertBiome && this.weather === 'clear') {
            this.weatherParticles = this.add.particles('pixel');
            this.weatherEmitter = this.weatherParticles.createEmitter({
                x: { min: cam.scrollX - 20, max: cam.scrollX + cam.width + 20 },
                y: { min: cam.scrollY, max: cam.scrollY + cam.height },
                lifespan: 400,
                speedX: { min: 60, max: 120 },
                speedY: { min: -30, max: 30 },
                scale: { start: 0.3, end: 0 },
                quantity: 1,
                frequency: 80,
                tint: 0xEDC9A4
            });
            if (this.weatherParticles) this.weatherParticles.setScrollFactor(0);
            this.weatherEmitter.setDepth(9998);
        }
    }

    updateWeatherIndicator() {
        const el = document.getElementById('weather-indicator');
        if (!el) return;
        const labels = { clear: '☀️ 맑음', rain: '🌧 비', acid_rain: '☠️ 산성비' };
        el.innerText = '날씨: ' + (labels[this.weather] || this.weather);
    }

    isPlayerUnderRoof(wx, wy) {
        const gx = Math.floor(wx / 32) * 32 + 16;
        const gy = Math.floor(wy / 32) * 32 + 16;
        const aboveKey = `${gx}_${gy - 32}`;
        return !!this.blocks[aboveKey];
    }

    maybeSpawnCrystals() {
        db.ref('blocks').once('value', (snap) => {
            const v = snap.val() || {};
            const snowCrystals = Object.values(v).filter((b) => b && b.type === 'crystal' && safeNum(b.y) < BIOME_SNOW_Y + 100).length;
            const desertCrystals = Object.values(v).filter((b) => b && b.type === 'crystal' && safeNum(b.x) > BIOME_DESERT_X - 100).length;
            const snowNeed = Math.max(0, CRYSTAL_TARGET - snowCrystals);
            const desertNeed = Math.max(0, CRYSTAL_TARGET - desertCrystals);
            if (snowNeed > 0 || desertNeed > 0) this.spawnCrystals(snowNeed, desertNeed);
        });
    }

    spawnCrystals(snowNeed, desertNeed) {
        const snowPos = [], desertPos = [];
        const tilesX = Math.floor(WORLD_WIDTH / 32), tilesY = Math.floor(WORLD_HEIGHT / 32);
        for (let gx = 0; gx < tilesX; gx++) for (let gy = 0; gy < 3; gy++) {
            const px = gx * 32 + 16, py = gy * 32 + 16;
            if (px >= PRISON_GRID_MIN && px <= PRISON_GRID_MAX && py >= PRISON_GRID_MIN && py <= PRISON_GRID_MAX) continue;
            snowPos.push({ x: px, y: py, key: px + '_' + py });
        }
        const desertStart = Math.max(0, tilesX - 3);
        for (let gx = desertStart; gx < tilesX; gx++) for (let gy = 0; gy < tilesY; gy++) {
            const px = gx * 32 + 16, py = gy * 32 + 16;
            if (px >= PRISON_GRID_MIN && px <= PRISON_GRID_MAX && py >= PRISON_GRID_MIN && py <= PRISON_GRID_MAX) continue;
            desertPos.push({ x: px, y: py, key: px + '_' + py });
        }
        Phaser.Utils.Array.Shuffle(snowPos);
        Phaser.Utils.Array.Shuffle(desertPos);
        snowPos.slice(0, Math.min(snowNeed, snowPos.length)).forEach((p) => {
            db.ref('blocks/' + p.key).transaction((cur) => (!cur ? { x: p.x, y: p.y, type: 'crystal', remaining: CRYSTAL_REMAINING } : undefined));
        });
        desertPos.slice(0, Math.min(desertNeed, desertPos.length)).forEach((p) => {
            db.ref('blocks/' + p.key).transaction((cur) => (!cur ? { x: p.x, y: p.y, type: 'crystal', remaining: CRYSTAL_REMAINING } : undefined));
        });
    }

    update() {
        if (!this.myPlayer) return;
        const now = Date.now();
        this.doorKeys.forEach((key) => {
            const block = this.blocks[key];
            if (!block || !block.body) return;
            const isOpen = this.doorOpenUntil[key] && now < this.doorOpenUntil[key];
            block.setAlpha(isOpen ? 0.25 : 1);
            block.body.checkCollision.none = isOpen;
        });

        const ui = this.getUICache();
        if (ui.materialIndicator) {
            if (Phaser.Input.Keyboard.JustDown(this.key1)) { this.currentMaterial = 'wall'; ui.materialIndicator.innerText = "현재 재료: 🔲 돌벽 (1)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key2)) { this.currentMaterial = 'grass'; ui.materialIndicator.innerText = "현재 재료: 🌿 잔디 (2)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key3)) { this.currentMaterial = 'water'; ui.materialIndicator.innerText = "현재 재료: 💧 물 (3)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key4)) { this.currentMaterial = 'sign'; ui.materialIndicator.innerText = "현재 재료: 🪧 표지판 (4)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key5)) { this.currentMaterial = 'door'; ui.materialIndicator.innerText = "현재 재료: 🚪 문 (5)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key6)) { this.currentMaterial = 'totem'; ui.materialIndicator.innerText = "현재 재료: 🏛 토템 (6, 돌100+나무100)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key7)) { this.currentMaterial = 'tnt'; ui.materialIndicator.innerText = `현재 재료: 💣 TNT (7, 돌${TNT_COST_STONE}+나무${TNT_COST_WOOD}+HP${TNT_COST_HP})`; }
            if (Phaser.Input.Keyboard.JustDown(this.key8)) { this.currentMaterial = 'shop'; ui.materialIndicator.innerText = "현재 재료: 🏪 상점 (8, 나무 20개)"; }
            if (Phaser.Input.Keyboard.JustDown(this.key9)) {
                if (this.myReputation >= BATON_REP_REQUIRED) {
                    this.currentMaterial = 'police_baton';
                    ui.materialIndicator.innerText = "현재 도구: 🛡 진압봉 (9, 체포 모드)";
                } else {
                    this.showToast("권한이 없습니다. (평판 20 이상 필요)");
                }
            }
        }

        /* V14: 감옥 시간 만료 시 해제 */
        if (this.myIsJailed && this.myJailedUntil > 0 && Date.now() >= this.myJailedUntil) {
            this.myIsJailed = false;
            this.myJailedUntil = 0;
            db.ref('players/' + this.myId).update({ isJailed: false, jailedUntil: 0 });
            this.showToast("감옥에서 풀려났습니다.");
        }

        const pointer = this.input.activePointer;
        const mx = Phaser.Math.Clamp(Math.floor(pointer.worldX / 32) * 32, 0, WORLD_WIDTH - 32);
        const my = Phaser.Math.Clamp(Math.floor(pointer.worldY / 32) * 32, 0, WORLD_HEIGHT - 32);
        this.marker.x = mx;
        this.marker.y = my;
        this.marker.clear();
        this.marker.lineStyle(2, this.shiftKey.isDown ? 0xff0000 : 0xffffff, 1);
        this.marker.strokeRect(0, 0, 32, 32);

        /* V18: 지역(Biome) & 날씨 효과 */
        const snowBiome = this.myPlayer.y < BIOME_SNOW_Y;
        const desertBiome = this.myPlayer.x > BIOME_DESERT_X;
        let speed = 160;
        if (desertBiome) speed *= DESERT_SPEED_MULT;

        /* 설원: 매초 HP -1 */
        this.snowDamageAccum = (this.snowDamageAccum || 0) + (snowBiome ? 1 : 0);
        if (this.snowDamageAccum >= 60) {
            this.snowDamageAccum = 0;
            if (snowBiome) {
                db.ref('players/' + this.myId).once('value', (snap) => {
                    const d = snap.val();
                    if (!d) return;
                    const nhp = Math.max(0, safeNum(d.hp, 100) - SNOW_HP_PER_SEC);
                    db.ref('players/' + this.myId).update({ hp: nhp });
                });
            }
        }
        if (!snowBiome) this.snowDamageAccum = 0;

        /* 산성비: 지붕 없으면 플레이어·토템 데미지 */
        if (this.weather === 'acid_rain') {
            this.acidRainDamageAccum = (this.acidRainDamageAccum || 0) + 1;
            if (this.acidRainDamageAccum >= 60) {
                this.acidRainDamageAccum = 0;
                if (!this.isPlayerUnderRoof(this.myPlayer.x, this.myPlayer.y)) {
                    db.ref('players/' + this.myId).once('value', (snap) => {
                        const d = snap.val();
                        if (!d) return;
                        const nhp = Math.max(0, safeNum(d.hp, 100) - ACID_RAIN_DAMAGE);
                        db.ref('players/' + this.myId).update({ hp: nhp });
                    });
                }
                for (const key in this.totemsData) {
                    const t = this.totemsData[key];
                    if (!t) continue;
                    const aboveKey = `${Math.floor(t.x / 32) * 32 + 16}_${Math.floor(t.y / 32) * 32 + 16 - 32}`;
                    if (!this.blocks[aboveKey]) {
                        db.ref('blocks/' + key).transaction((cur) => {
                            if (!cur || cur.type !== 'totem') return;
                            const nhp = Math.max(0, safeNum(cur.hp, 10000) - ACID_RAIN_BLOCK_DAMAGE);
                            return nhp <= 0 ? null : { ...cur, hp: nhp };
                        });
                    }
                }
            }
        } else { this.acidRainDamageAccum = 0; }

        /* 날씨 효과 주기적 갱신 (바이옴 전환 시) */
        if (this._lastSnowBiome !== snowBiome || this._lastDesertBiome !== desertBiome) {
            this._lastSnowBiome = snowBiome;
            this._lastDesertBiome = desertBiome;
            this.updateWeatherEffects();
        }

        this.myPlayer.setVelocity(0);
        const isJailedNow = this.myIsJailed && this.myJailedUntil > 0 && Date.now() < this.myJailedUntil;
        if (!isJailedNow && document.activeElement !== (ui.chatInput || null)) {
            if (this.keyA.isDown) { this.myPlayer.setVelocityX(-speed); this.lastDir.x = -1; this.lastDir.y = 0; }
            else if (this.keyD.isDown) { this.myPlayer.setVelocityX(speed); this.lastDir.x = 1; this.lastDir.y = 0; }
            if (this.keyW.isDown) { this.myPlayer.setVelocityY(-speed); this.lastDir.x = 0; this.lastDir.y = -1; }
            else if (this.keyS.isDown) { this.myPlayer.setVelocityY(speed); this.lastDir.x = 0; this.lastDir.y = 1; }
        }

        /* V16: 다른 유저 이모티콘 위치 추적 */
        for (const id in this.playerEmoticonTexts) {
            const p = this.players[id];
            const txt = this.playerEmoticonTexts[id];
            if (p && txt && txt.scene) {
                txt.x = p.x;
                txt.y = p.y - 50;
            }
        }

        /* V15: 펫 추적 (Lerp, 40px 유지) */
        if (this.myPetSprite) {
            const ox = this.myPlayer.x, oy = this.myPlayer.y;
            let tx = this.myPetSprite.x, ty = this.myPetSprite.y;
            const dx = tx - ox, dy = ty - oy;
            let dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
            if (dist > 0.001) {
                const targetDist = PET_FOLLOW_DIST;
                const tx2 = ox + (dx / dist) * targetDist, ty2 = oy + (dy / dist) * targetDist;
                this.myPetSprite.x = Phaser.Math.Linear(tx, tx2, PET_FOLLOW_LERP);
                this.myPetSprite.y = Phaser.Math.Linear(ty, ty2, PET_FOLLOW_LERP);
            } else { this.myPetSprite.x = ox + 20; this.myPetSprite.y = oy + 20; }
        }
        for (const id in this.playerPetData) {
            const pd = this.playerPetData[id];
            const owner = this.players[id];
            if (!pd || !pd.petSprite || !owner) continue;
            const ox = owner.x, oy = owner.y;
            let tx = pd.petSprite.x, ty = pd.petSprite.y;
            const dx = tx - ox, dy = ty - oy;
            let dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
            if (dist > 0.001) {
                const tx2 = ox + (dx / dist) * PET_FOLLOW_DIST, ty2 = oy + (dy / dist) * PET_FOLLOW_DIST;
                pd.petSprite.x = Phaser.Math.Linear(tx, tx2, PET_FOLLOW_LERP);
                pd.petSprite.y = Phaser.Math.Linear(ty, ty2, PET_FOLLOW_LERP);
            } else { pd.petSprite.x = ox + 20; pd.petSprite.y = oy + 20; }
        }

        if (Phaser.Input.Keyboard.JustDown(this.keySpace) && (this.lastDir.x !== 0 || this.lastDir.y !== 0)) {
            const px = this.myPlayer.x, py = this.myPlayer.y;
            const pushDist = 64, pushRange = 56;
            const fx = this.add.circle(px + this.lastDir.x * 24, py + this.lastDir.y * 24, 4, 0xffffff, 0.9);
            this.tweens.add({ targets: fx, scaleX: 3, scaleY: 3, alpha: 0, duration: 200, onComplete: () => fx.destroy() });
            this.otherPlayersGroup.getChildren().forEach((p) => {
                const dx = p.x - px, dy = p.y - py;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < pushRange && dist > 0) {
                    const dot = (dx * this.lastDir.x + dy * this.lastDir.y) / dist;
                    if (dot > 0.5) {
                        const id = Object.keys(this.players).find((k) => this.players[k] === p);
                        if (id) {
                            const nx = p.x + (dx / dist) * pushDist;
                            const ny = p.y + (dy / dist) * pushDist;
                            this.tweens.add({
                                targets: p, x: nx, y: ny,
                                duration: 180, ease: 'Quad.easeOut',
                                onComplete: () => db.ref('players/' + id).update({ x: nx, y: ny })
                            });
                        }
                    }
                }
            });
        }
    }
}
