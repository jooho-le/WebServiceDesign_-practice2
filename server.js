/**
 * 웹서비스설계 9주차 실습: 검색·정렬과 오프셋/커서 페이지네이션
 * npm ci → node server.js → http://localhost:3000
 * 데이터는 1,000건의 배열이며 실제 DB를 사용하지 않습니다.
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// 제출 자료·서버 소스·node_modules를 정적 공개하지 않습니다.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.json());

// 실습용 게시글 1,000건 생성 (ID 1000~1)
const TOPICS = [
  'B-Tree 인덱스 구조와 LIKE %kw% 검색 튜닝 실무',
  '커서 기반(Keyset) 페이지네이션 O(log N) 탐색 원리',
  'ORDER BY SQL Injection과 화이트리스트 매핑 방어',
  'InnoDB 버퍼 풀과 LIMIT OFFSET Cache Thrashing',
  'AbortController를 이용한 비동기 Race Condition 방어',
  '300ms 디바운스(Debounce)와 프론트엔드 입력 최적화',
  'URLSearchParams와 history.pushState 뒤로가기 동기화',
  'InnoDB MVCC 메커니즘과 COUNT(*) 전수 스캔 병목',
  '복합 인덱스(Compound Index) 컬럼 순서의 황금률',
  'Redis 분산 캐시를 활용한 카운트 캐싱 아키텍처',
  'RESTful JSON 페이징 Envelope 규격 표준화',
  'ElasticSearch 역색인(Inverted Index)과 N-gram 전문 검색'
];
const AUTHORS = ['이경수', '김철수', '이영희', '박민수', '정다은', '최준호', '강서연', '윤성호'];

const POSTS = Array.from({ length: 1000 }, (_, i) => {
  const id = 1000 - i;
  const topic = TOPICS[i % TOPICS.length];
  const author = AUTHORS[i % AUTHORS.length];
  // 재실행해도 동일하며 동점 정렬 검증이 가능한 데이터
  const views = ((id * 37) % 101) * 10 + 10;
  return {
    id,
    title: `[#${id}] ${topic}`,
    content: `게시글 ${id}번의 상세 본문 데이터입니다. DB 인덱스와 페이징 최적화를 실습합니다.`,
    author,
    views,
    createdAt: new Date(Date.UTC(2026, 0, 1) + (id - 1) * 3600000).toISOString().slice(0, 10)
  };
});

// 허용된 정렬 방식. 조회수가 같으면 ID가 큰 글부터 표시합니다.
const SORT_WHITELIST = Object.freeze({
  latest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  views: (a, b) => (b.views !== a.views ? b.views - a.views : b.id - a.id)
});

// 쿼리 배열/객체도 문자열 메서드에 전달하지 않도록 정규화합니다.
function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
function searchTerm(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function matchesSearch(post, search) {
  return post.title.toLowerCase().includes(search) || post.content.toLowerCase().includes(search);
}

// ==========================================
// 1. 오프셋 기반 페이지네이션 API
// GET /api/posts?page=1&limit=10&sort=views&search=인덱스
// ==========================================
app.get('/api/posts', (req, res) => {
  const startTime = process.hrtime();

  // 파라미터 정제 및 방어 코딩
  const page = positiveInt(req.query.page, 1);
  const limit = positiveInt(req.query.limit, 10, 100);
  const search = searchTerm(req.query.search);
  const sortKey = typeof req.query.sort === 'string' && Object.hasOwn(SORT_WHITELIST, req.query.sort)
    ? req.query.sort : 'latest';

  // 1) 제목·본문에서 검색
  const filtered = POSTS.filter(p => matchesSearch(p, search));

  // 2) 화이트리스트 정렬 (ORDER BY ...)
  const sortComparator = SORT_WHITELIST[sortKey];
  filtered.sort(sortComparator);

  // 3) 오프셋 계산 및 데이터 슬라이싱
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  const diff = process.hrtime(startTime);
  const executionTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

  res.setHeader('X-Response-Time', `${executionTimeMs}ms`);
  res.json({
    items,
    meta: {
      page: safePage,
      sort: sortKey,
      limit,
      totalCount,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      executionTimeMs: Number(executionTimeMs)
    }
  });
});

// ==========================================
// 2. 커서 기반(Keyset) 페이지네이션 API
// GET /api/posts/cursor?cursor=950&limit=10
// ==========================================
app.get('/api/posts/cursor', (req, res) => {
  const startTime = process.hrtime();

  const cursor = positiveInt(req.query.cursor, null);
  const limit = positiveInt(req.query.limit, 10, 50);
  const search = searchTerm(req.query.search);

  // 검색과 커서 조건을 먼저 적용하고 ID 내림차순으로 고정합니다.
  const candidate = POSTS.filter(p => matchesSearch(p, search) && (cursor === null || p.id < cursor))
    .sort((a, b) => b.id - a.id);

  // 한 개를 더 확인해 다음 결과가 있는지 판단합니다.
  const sliced = candidate.slice(0, limit + 1);
  const hasNext = sliced.length > limit;
  const items = hasNext ? sliced.slice(0, limit) : sliced;
  const nextCursor = items.length > 0 ? items[items.length - 1].id : null;

  const diff = process.hrtime(startTime);
  const executionTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

  res.setHeader('X-Response-Time', `${executionTimeMs}ms`);
  res.json({
    items,
    meta: {
      cursor,
      nextCursor,
      limit,
      hasNext,
      executionTimeMs: Number(executionTimeMs)
    }
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`웹서비스설계 9주차 실습 서버 실행`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`데이터: 1,000건의 인메모리 게시글 로드 완료`);
  console.log(`====================================================`);
});
