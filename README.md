# 몬스터 믹스 (MVP v2)

소울을 모아 몬스터를 소환하고, 합성해서 상위 몬스터를 만드는 턴제 RPG 웹게임 시제품.

- 플레이: `index.html` (빌드 없음, 폰 세로 화면 기준)
- 규칙 테스트: `test.html` 또는 `node js/tests.js`
- 밸런스 숫자: `js/balance.js` 한 파일 (드랍률은 게임 화면에 표시하지 않음)

## 파일
| 파일 | 하는 일 |
|---|---|
| `js/balance.js` | 모든 숫자. 단계별 목록은 MAX_TIER보다 짧아도 자동 연장 |
| `js/data.js` | 속성, 부재료 짝 원형, 상성, 날짜·조사 도우미 |
| `js/logic.js` | 규칙 (합성·소울·분해·드랍·전투·던전·오프라인·튜토리얼·기록) |
| `js/ui.js` | 화면과 입력, 브라우저 저장 |
| `js/tests.js` | 규칙 테스트 |
| `tools/balance-elements.js` | 속성별 스탯 균형 자동 조정 |
| `tools/tune-difficulty.js` | 스테이지·던전 난이도 자동 조정 |
| `tools/month-sim.js` | 실제 규칙으로 한 달 플레이 시뮬레이션 (5단계 5종 완성일) |
| `devlog/` | 제작 기록 스크린샷 |

## 밸런스 다시 맞추기
```
node tools/balance-elements.js   # 속성 균형
node tools/tune-difficulty.js    # 난이도
node tools/month-sim.js 12 60    # 한 달 템포 (플레이어 12명, 최대 60일)
```
