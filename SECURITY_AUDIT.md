# Flexible-World 보안 감사 보고서 (CISO)

## 1. Firebase Security Rules

### 1.1 엄격 규칙 (권장) – `database.rules.json`

**⚠️ 필수 전제: Firebase Anonymous Auth 적용 필요**

현재 게임은 `myId = 'user_' + Math.random()` 형태로 클라이언트가 ID를 생성합니다. **이 방식은 근본적으로 위변조 가능**하므로, 아래 규칙을 사용하려면 **Firebase Anonymous Auth**를 도입하고 `auth.uid`를 플레이어 ID로 사용해야 합니다.

```json
{
  "rules": {
    "players": {
      ".read": "auth != null",
      "$playerId": {
        ".read": true,
        ".write": "auth != null && auth.uid === $playerId",
        ".validate": "(!newData.hasChild('x') || (newData.child('x').isNumber() && newData.child('x').val() >= 0 && newData.child('x').val() <= 900)) &&
          (!newData.hasChild('y') || (newData.child('y').isNumber() && newData.child('y').val() >= 0 && newData.child('y').val() <= 700)) &&
          (!newData.hasChild('hp') || (newData.child('hp').isNumber() && newData.child('hp').val() >= 0 && newData.child('hp').val() <= 100)) &&
          (!newData.hasChild('stone') || (newData.child('stone').isNumber() && newData.child('stone').val() >= 0 && newData.child('stone').val() <= 99999)) &&
          (!newData.hasChild('wood') || (newData.child('wood').isNumber() && newData.child('wood').val() >= 0 && newData.child('wood').val() <= 99999)) &&
          (!newData.hasChild('nickname') || (newData.child('nickname').isString() && newData.child('nickname').val().length <= 20)) &&
          (!newData.hasChild('reputation') || (newData.child('reputation').isNumber() && newData.child('reputation').val() >= -100 && newData.child('reputation').val() <= 100)) &&
          (!newData.hasChild('chat') || (newData.child('chat').isString() && newData.child('chat').val().length <= 100))"
      }
    },
    "blocks": {
      ".read": "auth != null",
      "$blockKey": {
        ".write": "auth != null",
        ".validate": "newData.hasChild('type') &&
          newData.child('type').val().matches('^(wall|grass|water|sign|door|totem|tnt|shop|rock|tree|drop)$') &&
          newData.child('x').isNumber() &&
          newData.child('x').val() >= 0 &&
          newData.child('x').val() <= 900 &&
          newData.child('y').isNumber() &&
          newData.child('y').val() >= 0 &&
          newData.child('y').val() <= 700 &&
          $blockKey.matches('^[0-9]+_[0-9]+$') &&
          (!newData.hasChild('stone') || (newData.child('stone').isNumber() && newData.child('stone').val() >= 0 && newData.child('stone').val() <= 9999)) &&
          (!newData.hasChild('wood') || (newData.child('wood').isNumber() && newData.child('wood').val() >= 0 && newData.child('wood').val() <= 9999)) &&
          (!newData.hasChild('text') || (newData.child('text').isString() && newData.child('text').val().length <= 500)) &&
          (!newData.hasChild('hp') || (newData.child('hp').isNumber() && newData.child('hp').val() >= 0 && newData.child('hp').val() <= 10000))"
      }
    },
    "server": {
      ".read": "auth != null",
      "announcement": {
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['message','author','timestamp']) &&
          newData.child('message').isString() &&
          newData.child('message').val().length <= 200 &&
          newData.child('author').isString() &&
          newData.child('author').val().length <= 20 &&
          newData.child('timestamp').isNumber()"
      }
    },
    ".info": {
      ".read": "auth != null"
    }
  }
}
```

**주의:** `showReputationMenu`에서 `db.ref('players/' + targetId)`로 **다른 플레이어의 reputation을 직접 수정**합니다. 위 규칙은 `auth.uid === $playerId`만 허용하므로, **평판 변경 기능은 별도 처리 필요**합니다.  
- 옵션 1: Cloud Functions로 평판 변경 처리  
- 옵션 2: `players/$id/reputation` 경로를 두고, 해당 경로만 다른 사용자 쓰기 허용 (규칙 추가)

---

## 2. Anti-Cheat Logic 제안

클라이언트는 조작 가능하므로, 서버(Firebase Rules / Cloud Functions) 검증이 핵심입니다. 아래는 클라이언트 측 추가 검증과 함께 서버 측에서 적용할 수 있는 검증 아이디어입니다.

### 2.1 스피드핵 / 텔레포트 방어

**현재 문제:** 50ms마다 `{x, y}`를 그대로 전송하며, 이동 거리·속도 검증이 없음.

**제안: 클라이언트 측 검증 (우선 적용)**

```javascript
// MainScene.js - 위치 전송 전 검증
const MAX_SPEED = 160;
const MAX_DIST_PER_TICK = (MAX_SPEED / 1000) * 100; // 50ms 간격 가정 → 약 8px

const lastSentPos = { x: this.myPlayer.x, y: this.myPlayer.y, time: Date.now() };

// 50ms 루프 콜백 내부:
const now = Date.now();
const dt = (now - lastSentPos.time) / 1000;
const dx = this.myPlayer.x - lastSentPos.x;
const dy = this.myPlayer.y - lastSentPos.y;
const dist = Math.sqrt(dx*dx + dy*dy);
const maxAllowed = MAX_DIST_PER_TICK + 5; // 여유 5px

if (dist <= maxAllowed && (v.x !== 0 || v.y !== 0)) {
  db.ref('players/' + this.myId).update({ x: this.myPlayer.x, y: this.myPlayer.y });
  lastSentPos.x = this.myPlayer.x;
  lastSentPos.y = this.myPlayer.y;
  lastSentPos.time = now;
}
```

**서버 측:** Firebase Rules만으로는 속도/거리 검증이 불가능합니다. Cloud Functions로 `onWrite` 훅을 두고, 이전 위치·시간과 비교해 비정상 이동을 거부하는 방식을 권장합니다.

### 2.2 자원 복사 / 무한 자원 방어

**현재 문제:**  
- 드롭 획득, 채집, 상점 거래, 건설 등에서 클라이언트가 `stone`/`wood`를 직접 `update`  
- 자원 차감·증가가 단순 연산으로만 이루어져, 위변조 시 무한 자원 가능

**제안:**

1. **Firebase Rules로 상한 강제**  
   - `stone`, `wood`에 대해 0~99999 등 허용 범위와 타입 검증 (위 규칙에 포함됨)

2. **클라이언트 측 이중 체크**  
   - 자원 증가 전에 반드시 `once('value')`로 서버 상태를 읽고, 그 값 기준으로만 증감 요청

3. **Cloud Functions로 트랜잭션 처리 (권장)**  
   - 채집, 드롭 획득, 상점 거래, 건설을 Cloud Function으로 처리  
   - 서버에서 “차감 후 증가”를 원자적으로 수행

### 2.3 채집 속도 제한 (연타 방지)

**현재 문제:** `gatherProgress[blockKey] >= 2`만 확인하여, 짧은 시간에 여러 번 클릭 시 비정상적으로 빠른 채집 가능.

**제안:**

```javascript
// 채집 쿨다운 (예: 500ms)
const GATHER_COOLDOWN_MS = 500;
this.lastGatherTime = this.lastGatherTime || {};

// 채집 로직 진입 시
const now = Date.now();
if (this.lastGatherTime[blockKey] && now - this.lastGatherTime[blockKey] < GATHER_COOLDOWN_MS) {
  return; // 조기 반환
}
this.lastGatherTime[blockKey] = now;
```

### 2.4 액션 빈도 제한 (Rate Limiting)

**현재 문제:** 공격, 채집, 건설 등에 빈도 제한이 없음.

**제안:**

```javascript
// 예: 초당 최대 5회 공격
const ACTION_LIMIT = { attack: 5, gather: 10, build: 3 };
const actionCounts = {};
const actionWindowStart = Date.now();

function canPerformAction(type) {
  const now = Date.now();
  if (now - actionWindowStart > 1000) {
    Object.keys(actionCounts).forEach(k => actionCounts[k] = 0);
    actionWindowStart = now;
  }
  actionCounts[type] = (actionCounts[type] || 0) + 1;
  return actionCounts[type] <= (ACTION_LIMIT[type] || 10);
}
```

---

## 3. 취약점 점검 요약

### 3.1 🔴 심각 (Critical)

| 취약점 | 위치 | 설명 |
|--------|------|------|
| **인증 없음** | `game.js`, `startData.js` | `myId = 'user_' + Math.random()` — 클라이언트가 ID를 생성하여, 다른 유저 ID로 요청 위조 가능 |
| **타인 플레이어 데이터 덮어쓰기** | `MainScene.js` | `db.ref('players/' + pid).update(...)` — `pid`를 임의로 지정해 HP, 위치, 자원 등을 마음대로 수정 가능 |
| **문 비밀번호 평문 저장** | `MainScene.js` L352, L288 | `password: pwd.trim()` — DB에 평문 저장되어, DB 접근 시 비밀번호 노출 |

### 3.2 🟠 높음 (High)

| 취약점 | 위치 | 설명 |
|--------|------|------|
| **스피드핵 / 텔레포트** | `MainScene.js` L467 | 50ms마다 `{x, y}` 전송, 이동 거리 검증 없음 |
| **자원 무한 증가** | 전체 | 클라이언트가 `stone`/`wood`를 직접 `update` — 개발자 도구로 무제한 수정 가능 |
| **확성기 비용 우회** | `MainScene.js` L417–423 | `/shout` 시 `stone >= 50` 체크가 클라이언트에서만 이루어짐 — 우회 가능 |
| **평판 조작** | `MainScene.js` L793–797 | `db.ref('players/' + targetId).transaction(...)` — 누구나 다른 유저의 reputation을 변경 가능 |

### 3.3 🟡 중간 (Medium)

| 취약점 | 위치 | 설명 |
|--------|------|------|
| **드롭 이중 획득** | `MainScene.js` L299–307 | `remove()`와 `update()`가 원자적이지 않아, race condition으로 같은 드롭을 여러 번 획득 가능 |
| **채집 race condition** | `MainScene.js` L313–329 | `transaction` 후 별도 `update`로 자원 지급 — 타이밍 조작 가능 |
| **리소스 스폰 권한** | `MainScene.js` L631–641 | `maybeSpawnResources`가 클라이언트에서 실행 — 악의적 클라이언트가 스폰 로직 조작 가능 |
| **TNT 대량 설치** | `MainScene.js` L368–370 | 비용 검증이 클라이언트에만 있어, 서버 규칙 없으면 우회 가능 |

### 3.4 🟢 낮음 (Low)

| 취약점 | 위치 | 설명 |
|--------|------|------|
| **닉네임 길이** | `index.html` | `maxlength="6"`만 있음 — DB에 직접 쓰기 시 더 긴 닉네임 저장 가능 |
| **채팅 길이** | `index.html` | `maxlength="50"` — 마찬가지로 DB 직접 쓰기 시 우회 가능 |
| **API 키 노출** | `firebaseConfig.js` | 클라이언트에 포함 — RTDB는 Rules로 보호해야 하며, API 키 자체는 공개가 일반적 |

---

## 4. 우선 적용 권장 사항

1. **Firebase Anonymous Auth 도입**  
   - `auth.uid`를 플레이어 ID로 사용  
   - `database.rules.json`에서 `auth.uid === $playerId` 기반 쓰기 제한 적용

2. **database.rules.json 배포**  
   - Firebase Console → Realtime Database → Rules에 위 규칙 적용

3. **문 비밀번호 해시 저장**  
   - bcrypt 등으로 해시 후 저장 (클라이언트 해시 또는 Cloud Functions 사용)

4. **핵심 경제 로직을 Cloud Functions로 이전**  
   - 채집, 드롭 획득, 상점, 건설 시 자원 증감을 서버에서만 처리

5. **위치·속도 검증**  
   - 가능하면 Cloud Functions `onWrite`에서 이전 위치·시간과 비교해 비정상 이동 거부

---

*작성: Flexible-World CISO 관점 보안 감사*
