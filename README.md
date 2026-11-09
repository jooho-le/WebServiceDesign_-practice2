# 검색·정렬·페이지네이션 게시판

웹서비스설계 9주차 예제를 수정한 실습이다. 1,000건의 인메모리 데이터를 사용하며 실제 DB는 연결하지 않는다.

## 실행

Node.js 20 이상이 필요하다.

```bash
npm ci
npm start
```

http://localhost:3000 접속. 서버 종료는 Ctrl+C.

## 기존 코드에서 바꾼 부분

- 정렬 키를 `Object.hasOwn`으로 검사해 `__proto__`, `constructor` 등 상속 속성도 차단한다.
- 커서 API에 제목·본문 검색을 추가했다. 검색·커서 조건 적용 후 `limit + 1`개를 확인한다.
- 커서는 ID 내림차순으로 고정하고 정렬 선택을 비활성화했다. 검색어를 바꾸면 누적 목록과 커서를 초기화한다.
- 입력 즉시 이전 요청을 취소하고 요청 번호도 확인해 늦게 도착한 응답을 차단한다. 수동 조회 시 대기 중인 디바운스 타이머를 취소한다.
- URL 복원 함수를 공통으로 사용하고 서버가 보정한 페이지도 화면과 주소에 반영한다.
- 조회수 동점 테스트를 위해 데이터를 고정하고 작성일 순서를 ID와 맞췄다. 화면의 SQL은 실제 실행 쿼리가 아닌 설명용으로 표시한다.
- 커서 수량 표시를 API 상한과 맞추고, 한글 조합이 끝난 뒤 검색하도록 처리했다.

원본은 `docs/original/`, 줄 단위 변경 내역은 `docs/changes.diff`에 있다.

## API와 동작 기준

```text
GET /api/posts?page=1&limit=10&sort=latest&search=Redis
GET /api/posts/cursor?limit=10&cursor=950&search=Redis
```

최신순은 ID 내림차순, 오래된순은 ID 오름차순, 조회순은 조회수 내림차순·동점 ID 내림차순이다. 검색은 제목·본문의 대소문자를 구분하지 않는 부분 일치다.

page와 limit은 양의 안전 정수만 허용한다. 잘못된 page는 1, 잘못된 limit은 10이다. limit 상한은 오프셋 100, 커서 50이다. 초과 page는 마지막 페이지로 보정한다. 빈 결과는 `items: []`, `page: 1`, `totalPages: 1`, `hasNext: false`로 처리한다.

커서의 nextCursor는 반환한 마지막 게시글 ID이며, 마지막 페이지 여부는 hasNext로 판단한다. 오프셋의 검색어·정렬·페이지·limit을 URL에 저장한다. 커서 진행 위치는 저장하지 않으며 새로고침이나 popstate는 주소의 오프셋 상태로 돌아간다.

## 테스트

Google Chrome이 설치되어 있어야 한다. 기존 서버를 종료하고 실행한다. 테스트가 3000 포트에서 서버를 시작하고 종료한다.

```bash
npm test
```

현재 13개 테스트로 검색·정렬·잘못된 입력값·커서 전체 순회·URL 복원·디바운스·취소·한글 조합·오류 재시도를 검사한다. 실행 결과와 캡처는 `docs/`에 저장된다.

Chrome이 없는 환경은 `npx playwright install chromium` 실행 후 `playwright.config.js`의 `channel: 'chrome'`을 제거한다. `tests/baseline.cjs`는 원본 비교용 별도 스크립트이며 기본 테스트에는 포함되지 않는다.

직접 확인할 때는 다음 순서로 비교할 수 있다.

1. 오프셋 3페이지에서 Redis 검색, 조회순 변경 후 1페이지인지 확인한다.
2. 상세 본문을 검색해 제목에 없는 단어도 검색되는지 확인한다.
3. 커서에서 Redis를 검색하고 마지막까지 더 보기를 누른다. 83건과 버튼 비활성화를 확인한다.
4. 검색어를 바꾸고 새로고침·뒤로 가기를 실행해 입력창·정렬·결과를 비교한다.
5. DevTools Network에서 빠른 연속 입력의 요청 수를 확인한다. Slow 3G에서 검색어를 바꿔 취소와 최종 결과를 확인한다.

## 보고서와 제출 자료

- [실습 보고서 PDF](docs/report.pdf) · [Markdown](docs/report.md)
- [테스트 캡처 목록](docs/captures/README.md)
- [최종 테스트 결과](docs/test-results.json)

오프셋·커서에 적합한 화면, 디바운스·요청 취소의 역할, limit+1 원리, offset·totalPages 계산식은 보고서 5절에 정리했다. 응답 시간은 관찰값이며 DB 인덱스 성능을 입증하는 자료로 사용하지 않는다.

보고서 내용은 `docs/report-template.md`에서 수정한다. 테스트 통과 후 Python 3과 Chrome이 설치된 환경에서 다음 명령으로 PDF·HTML·결과 요약 캡처를 갱신한다.

```bash
node scripts/export-report.cjs
```

테스트 수·환경·응답 시간·한글 조합 대기 시간은 실제 결과에서 읽는다. 테스트 내용이나 데이터가 달라지면 템플릿의 설명과 기대값도 함께 수정한다.

## AI 활용

AI를 코드 분석·수정, 테스트 작성·실행, 문서 정리에 사용했다. 기록된 결과는 로컬 API와 Chrome 자동 테스트로 확인했다. 이 문서의 테스트 결과는 자동 테스트 기준이다.

제출 마감은 **2026-11-15(일) 23:59 KST**다. GitHub에는 코드·README·lockfile·tests·scripts·docs를 올리고 `node_modules`는 제외한다. GitHub 링크는 LMS 온라인 작성란에, 보고서와 캡처는 파일 제출란에 제출한다. LMS 제출은 별도로 진행한다.

GitHub 저장소: https://github.com/jooho-le/WebServiceDesign_-practice2
