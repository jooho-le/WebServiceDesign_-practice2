# 테스트 캡처

| 파일 | 증거 | 보완 기록 |
|---|---|---|
| 00-before.png | 수정 전 예제 실행 화면 | ../baseline-results.json |
| 01-search-sort.png | Redis 검색 83건, 조회순, 요청 URL·응답 | ../api-evidence.json |
| 02-url-restored.png | 뒤로가기로 검색 초기화·오래된순 3페이지 복원 | ../test-results.json |
| 03-empty.png | 결과 없는 검색·빈 결과 meta | ../api-evidence.json |
| 04-cursor-end.png | Redis 83건 누적·정렬 비활성화·더 보기 종료 | ../cursor-evidence.json |
| 05-debounce.png | 연속 입력과 수동 조회 이후 최종 화면 | ../debounce-evidence.json |
| 06-cancel-final.png | 지연된 Redis 요청 취소 후 최종 AbortController 결과 | ../cancel-evidence.json |
| 07-test-evidence.png | 요청 횟수·취소 로그·순회 결과·13개 테스트 요약 | ../test-results.json 및 각 evidence.json |

화면 정지 캡처만으로 요청 횟수나 취소를 증명할 수 없으므로 실제 브라우저 요청 이벤트를 수집한 JSON과 함께 제출합니다. 한글 조합 입력의 요청 횟수·대기 시간은 ../ime-evidence.json에 있습니다. 07은 수집 결과를 읽기 쉽게 표시한 증거 요약이며 DevTools 화면 캡처는 아닙니다.
