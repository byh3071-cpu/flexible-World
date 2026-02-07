# Flexible-World 커뮤니티 총괄 점검 보고서 (V18)

**점검일:** 2025-02-07  
**범위:** 전체 코드베이스, 사용자 관점, 버그/UX 개선

---

## ✅ 수정 완료 항목

### 1. E키 자원 떨어뜨리기 — Crystal 미지원 (버그)
- **문제:** E키로 떨어뜨리기 시 돌·나무만 선택 가능, 수정(Crystal)은 드롭 불가
- **해결:** `MainScene.js`의 E키 핸들러에 Crystal 입력·드롭 로직 추가
- **영향:** 수정을 획득한 플레이어가 이제 E키로 수정도 떨어뜨려 드롭 아이템으로 전달 가능

### 2. Firebase Security Rules — 누락된 데이터 검증
- **문제:** `database.rules.json`에 V18 기능 관련 검증 누락
  - `blocks` type: `crystal` 미포함 → Crystal 블록 저장 거부
  - `players`: `crystal`, `jailedUntil` 검증 없음
  - `server/weather`: 규칙 없음 → 날씨 저장 거부
- **해결:** rules에 `crystal` 타입, players `crystal`/`jailedUntil`, `server/weather` 규칙 추가
- **영향:** 규칙 배포 시 Crystal, 날씨, 감옥 관련 데이터가 정상 저장됨

### 3. UI 버전 표시 불일치
- **문제:** 화면·title에 V15 표시, 실제 기능은 V18(환경·날씨, Crystal)
- **해결:** `index.html` title·h2를 V18 기준으로 업데이트

---

## ⚠️ 주의 필요 (배포 전 확인)

### 1. Firebase Auth와 Security Rules
- **현황:** `database.rules.json`은 `auth != null`을 요구하지만, 게임은 `user_123456` 형태의 클라이언트 ID를 사용하고 **Firebase Auth 미사용**
- **영향:** rules를 배포하면 **모든 read/write가 거부**되어 게임이 동작하지 않음
- **권장:** `SECURITY_AUDIT.md` 참고 — Firebase Anonymous Auth 도입 후 `auth.uid`를 플레이어 ID로 사용

### 2. main.js, map.js — 정리 완료
- **조치:** 미사용 레거시 파일 `main.js`, `map.js` 삭제 완료

---

## 📋 사용자 관점 점검 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 로그인 (닉네임) | ✅ | 입력 없으면 alert, Enter/클릭으로 시작 |
| 로그인 페이드아웃 | ✅ | 0.6초 애니메이션 후 화면 전환 |
| 인벤토리 UI | ✅ | 돌·나무·수정 표시, E키 안내 |
| 날씨 표시 | ✅ | `weather-indicator`에 clear/rain/acid_rain |
| 채팅 입력 | ✅ | pointer-events: auto로 포커스 시 정상 |
| 게임 캔버스 클릭 | ✅ | game-container에 mousedown 캡처 |
| 설원/사막 바이옴 | ✅ | y<80 설원, x>720 사막, HP/속도 적용 |
| Crystal 스폰 | ✅ | 설원·사막 구역에 스폰 |
| 감옥(bedrock) | ✅ | 클라이언트 전용, DB 미사용 (규칙 영향 없음) |

---

## 🔧 테스트 권장 시나리오

1. **E키 Crystal 드롭:** 수정 보유 후 E키 → 수정 개수 입력 → 드롭 생성 확인
2. **날씨 동기화:** 2명 이상 접속 시 3분마다 날씨 변경이 모든 클라이언트에 반영되는지 확인
3. **설원/사막:** y<80, x>720 구역에서 HP 감소·속도 감소 동작 확인
4. **산성비:** acid_rain 시 파티클·화면 필터·데미지 동작 확인

---

## 📁 수정된 파일

- `js/MainScene.js` — E키 Crystal 드롭 지원
- `database.rules.json` — crystal, server/weather, players crystal/jailedUntil 규칙
- `index.html` — V18 버전 표시
