const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const capture = (page, name) => page.screenshot({ path: `docs/captures/${name}.png`, fullPage: true });
async function get(request, path) {
  const r = await request.get(path);
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function ready(page) { await expect(page.locator('#status')).toContainText(/검색 결과|건 표시/); }
async function search(page, value) {
  const response = page.waitForResponse(r => r.url().includes('/api/posts') && new URL(r.url()).searchParams.get('search') === value);
  await page.locator('#searchInput').fill(value);
  await response;
  await ready(page);
}
test('API: 검색·정렬·상속 속성·파라미터·meta', async ({ request }) => {
  const all = [];
  for(let page=1;page<=10;page++) all.push(...(await get(request,`/api/posts?limit=100&page=${page}`)).items);
  expect(all).toHaveLength(1000);
  expect(new Set(all.map(p=>p.id)).size).toBe(1000);
  for (const sort of ['latest','oldest','views']) {
    const actual=[];
    for(let page=1;page<=10;page++) actual.push(...(await get(request,`/api/posts?sort=${sort}&limit=100&page=${page}`)).items);
    const expected=[...all].sort(sort==='oldest'?(a,b)=>a.id-b.id:sort==='views'?(a,b)=>b.views-a.views||b.id-a.id:(a,b)=>b.id-a.id);
    expect(actual).toEqual(expected);
    if(sort==='views') expect(actual.some((p,i)=>i>0&&p.views===actual[i-1].views)).toBeTruthy();
  }
  for (const sort of ['invalid','__proto__','constructor','toString']) {
    const j=await get(request,`/api/posts?sort=${sort}`);
    expect(j.meta.sort).toBe('latest');expect(j.items[0].id).toBe(1000);
  }
  for (const page of ['0','-1','abc']) expect((await get(request,`/api/posts?page=${page}`)).meta.page).toBe(1);
  expect((await get(request,'/api/posts?limit=1000')).meta.limit).toBe(100);
  expect((await get(request,'/api/posts?page=2&limit=10')).meta).toMatchObject({page:2,limit:10,totalCount:1000,totalPages:100,hasNext:true,hasPrev:true});
  for (const value of ['0', '-1', 'abc', '1.5', '999999999999999999999']) {
    expect((await get(request,`/api/posts?limit=${value}`)).meta.limit).toBe(10);
    expect((await get(request,`/api/posts/cursor?limit=${value}&cursor=${value}`)).meta).toMatchObject({limit:10,cursor:null});
  }
  expect((await get(request,'/api/posts/cursor?limit=1000')).meta.limit).toBe(50);
  expect((await get(request,'/api/posts?sort=views&sort=oldest&search=Redis&search=abc')).meta.sort).toBe('latest');
  const last=await get(request,'/api/posts?page=9999');expect(last.meta).toMatchObject({page:100,totalCount:1000,totalPages:100,hasNext:false,hasPrev:true});
  for(const term of ['Redis','상세 본문','NO_MATCH_987654']) {
    const j=await get(request,`/api/posts?limit=100&search=${encodeURIComponent(term)}`);
    const matches=all.filter(p=>(p.title+' '+p.content).toLowerCase().includes(term.toLowerCase()));
    expect(j.meta.totalCount).toBe(matches.length);expect(j.items).toEqual(matches.slice(0,100));
  }
  const empty=await get(request,'/api/posts?search=NO_MATCH_987654');expect(empty.meta).toMatchObject({page:1,totalPages:1,hasNext:false,hasPrev:false});
  expect((await request.get('/server.js')).status()).toBe(404);
  expect((await request.get('/index.html')).status()).toBe(200);
  const timing=[];
  for(const path of ['/api/posts?page=1','/api/posts?page=100','/api/posts/cursor?cursor=11']) {
    const start=performance.now();const response=await request.get(path);const json=await response.json();
    timing.push({path,clientMs:Number((performance.now()-start).toFixed(2)),serverMs:json.meta.executionTimeMs,responseTimeHeader:response.headers()['x-response-time']});
  }
  fs.writeFileSync('docs/api-evidence.json',JSON.stringify({count:all.length,unique:1000,last:last.meta,empty:empty.meta,timing},null,2));
});
test('API: 커서 검색 후 전체 순회·누락·중복·limit+1', async ({ request }) => {
  const evidence=[];
  for(const term of ['', 'Redis','상세 본문','NO_MATCH_987654']) {
    const expected=[];
    for(let page=1;;page++) {
      const j=await get(request,`/api/posts?limit=100&page=${page}&search=${encodeURIComponent(term)}`);
      expected.push(...j.items);if(!j.meta.hasNext) break;
    }
    let cursor=null, actual=[], pages=0;
    for(;;) {
      const j=await get(request,`/api/posts/cursor?limit=50&search=${encodeURIComponent(term)}${cursor===null?'':`&cursor=${cursor}`}`);
      actual.push(...j.items);pages++;
      expect(j.meta.hasNext).toBe(actual.length<expected.length);
      if(!j.meta.hasNext) break;
      expect(j.meta.nextCursor).toBeLessThan(cursor??1001);cursor=j.meta.nextCursor;
      expect(pages).toBeLessThan(30);
    }
    expect(actual).toEqual(expected);expect(new Set(actual.map(p=>p.id)).size).toBe(actual.length);
    evidence.push({search:term,count:actual.length,pages,duplicates:0,missing:0});
  }
  fs.writeFileSync('docs/cursor-evidence.json',JSON.stringify(evidence,null,2));
  const exactly=await get(request,'/api/posts/cursor?cursor=11&limit=10');expect(exactly.items).toHaveLength(10);expect(exactly.meta.hasNext).toBe(false);
  const extra=await get(request,'/api/posts/cursor?cursor=12&limit=10');expect(extra.items).toHaveLength(10);expect(extra.meta.hasNext).toBe(true);expect(extra.meta.nextCursor).toBe(2);
});
test('화면: 검색·정렬 초기화와 URL 새로고침·뒤로가기·페이지 보정', async ({page}) => {
  await page.goto('/?page=3&sort=oldest');await ready(page);
  await expect(page.locator('#tableBody tr').first().locator('td').first()).toHaveText('21');
  await search(page,'Redis');expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  await Promise.all([page.waitForResponse(r=>r.url().includes('sort=views')),page.locator('#sortSelect').selectOption('views')]);await ready(page);
  await capture(page,'01-search-sort');
  await page.reload();await ready(page);await expect(page.locator('#searchInput')).toHaveValue('Redis');await expect(page.locator('#sortSelect')).toHaveValue('views');
  await expect(page.locator('#tableBody tr').first().locator('td').first()).toHaveText('535');
  await page.goBack();await ready(page);await expect(page.locator('#sortSelect')).toHaveValue('oldest');await expect(page.locator('#searchInput')).toHaveValue('Redis');
  await expect(page.locator('#tableBody tr').first().locator('td').first()).toHaveText('7');
  await page.goBack();await ready(page);await expect(page.locator('#searchInput')).toHaveValue('');await expect(page.locator('.page-btn.active')).toHaveText('3');
  await capture(page,'02-url-restored');
  await page.goto('/?page=9999&sort=__proto__');await ready(page);expect(new URL(page.url()).searchParams.get('page')).toBe('100');await expect(page.locator('#sortSelect')).toHaveValue('latest');
  await search(page,'NO_MATCH_987654');await expect(page.locator('#tableBody')).toContainText('일치하는 글이 없습니다');await capture(page,'03-empty');
});
test('화면: 3페이지에서 정렬 변경 시 1페이지·앞으로가기·본문 검색', async ({page}) => {
  await page.goto('/?page=3&sort=latest');await ready(page);
  await Promise.all([page.waitForResponse(r=>r.url().includes('sort=oldest')),page.locator('#sortSelect').selectOption('oldest')]);await ready(page);
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');await expect(page.locator('.page-btn.active')).toHaveText('1');
  await page.goBack();await ready(page);await expect(page.locator('.page-btn.active')).toHaveText('3');
  await page.goForward();await ready(page);await expect(page.locator('.page-btn.active')).toHaveText('1');
  await search(page,'상세 본문');await expect(page.locator('#status')).toContainText('1000건');
});
test('화면: 커서 검색 변경·누적·마지막 버튼·모드 복원', async ({page}) => {
  await page.goto('/');await ready(page);await page.click('#tabCursor');await ready(page);
  await expect(page.locator('#sortSelect')).toBeDisabled();
  await search(page,'Redis');
  let clicks=0;
  while(await page.locator('#btnMore').isEnabled()) {
    await Promise.all([page.waitForResponse(r=>r.url().includes('/cursor?')),page.click('#btnMore')]);await ready(page);
    expect(++clicks).toBeLessThan(12);
  }
  const ids=await page.locator('#tableBody tr td:first-child').allTextContents();expect(ids).toHaveLength(83);expect(new Set(ids).size).toBe(83);
  await capture(page,'04-cursor-end');
  await search(page,'[#1000]');await expect(page.locator('#tableBody tr')).toHaveCount(1);await expect(page.locator('#btnMore')).toBeDisabled();
  await search(page,'NO_MATCH_987654');await expect(page.locator('#tableBody')).toContainText('일치하는 글이 없습니다');await expect(page.locator('#btnMore')).toBeDisabled();
  await page.click('#tabOffset');await ready(page);await expect(page.locator('#sortSelect')).toBeEnabled();
});
test('비동기: 300ms 디바운스·조회 버튼 중복 방지', async ({page}) => {
  await page.goto('/');await ready(page);
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/posts')) requests.push(r.url());});
  await page.locator('#searchInput').pressSequentially('Redis',{delay:50});
  await page.waitForResponse(r=>r.url().includes('search=Redis'));await ready(page);await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await page.locator('#searchInput').fill('AbortController');
  await Promise.all([page.waitForResponse(r=>r.url().includes('search=AbortController')),page.getByRole('button',{name:'조회',exact:true}).click()]);await ready(page);await page.waitForTimeout(400);expect(requests).toHaveLength(2);
  fs.writeFileSync('docs/debounce-evidence.json',JSON.stringify({typingIntervalMs:50,debounceMs:300,typingRequests:1,manualSearchRequests:1,requests},null,2));
  await capture(page,'05-debounce');
});
test('비동기: 느린 응답 취소·최종 결과 유지·AbortError', async ({page}) => {
  await page.goto('/');await ready(page);
  const errors=[], logs=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>logs.push(m.text()));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()}));
  await page.route('**/api/posts?**',async route=>{
    const response=await route.fetch();
    if(new URL(route.request().url()).searchParams.get('search')==='Redis') await new Promise(r=>setTimeout(r,1200));
    try {await route.fulfill({response});} catch { /* 취소된 요청은 브라우저에 전달할 수 없습니다. */ }
  });
  await page.locator('#searchInput').fill('Redis');await page.waitForRequest(r=>r.url().includes('search=Redis'));
  await search(page,'AbortController');await page.waitForTimeout(1400);
  await expect(page.locator('#tableBody')).toContainText('AbortController');await expect(page.locator('#tableBody')).not.toContainText('Redis');
  expect(logs.some(x=>x.includes('정상 취소'))).toBeTruthy();expect(errors).toEqual([]);expect(failed.length).toBeGreaterThan(0);
  fs.writeFileSync('docs/cancel-evidence.json',JSON.stringify({delayedResponseMs:1200,finalSearch:'AbortController',errors,logs,failed},null,2));
  await capture(page,'06-cancel-final');
});
test('비동기: 취소를 무시하는 응답도 화면을 덮어쓰지 않음',async({page})=>{
  await page.addInitScript(()=>{
    const original=window.fetch;
    window.fetch=async(input,options={})=>{
      const response=await original(input,{...options,signal:undefined});
      if(String(input).includes('search=Redis')) await new Promise(r=>setTimeout(r,1000));
      return response;
    };
  });
  await page.goto('/');await ready(page);
  await page.locator('#searchInput').fill('Redis');await page.waitForRequest(r=>r.url().includes('search=Redis'));
  await search(page,'AbortController');await page.waitForTimeout(1200);await expect(page.locator('#tableBody')).not.toContainText('Redis');await expect(page.locator('#tableBody')).toContainText('AbortController');
});
test('검토 보완: 커서 limit 상한·연속 클릭·오프셋 limit 유지', async ({page}) => {
  await page.goto('/?limit=100');await ready(page);
  await Promise.all([page.waitForResponse(r=>r.url().includes('/cursor?')),page.click('#tabCursor')]);await ready(page);
  await expect(page.locator('#tableBody tr')).toHaveCount(50);
  await expect(page.locator('#inspectUrl')).toContainText('limit=50');
  await expect(page.locator('#inspectSql')).toContainText('LIMIT 51');
  await expect(page.locator('#btnMore')).toContainText('다음 50개');
  const requests=[];
  page.on('request',r=>{if(r.url().includes('/cursor?')) requests.push(r.url());});
  const response=page.waitForResponse(r=>r.url().includes('cursor=951'));
  await page.evaluate(()=>{loadMoreCursor();loadMoreCursor();});await response;await ready(page);
  expect(requests).toHaveLength(1);await expect(page.locator('#tableBody tr')).toHaveCount(100);
  const ids=await page.locator('#tableBody tr td:first-child').allTextContents();expect(new Set(ids).size).toBe(100);
  await page.click('#tabOffset');await ready(page);
  expect(new URL(page.url()).searchParams.get('limit')).toBe('100');await expect(page.locator('#tableBody tr')).toHaveCount(100);
});
test('검토 보완: 한글 조합 중 요청 없음·조합 완료 후 300ms', async ({page}) => {
  await page.goto('/');await ready(page);
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/posts')) requests.push(r.url());});
  await page.evaluate(()=>{
    const input=document.getElementById('searchInput');
    window.compositionEndedAt=null;
    window.searchFetchTimes=[];
    const original=window.fetch;
    window.fetch=(...args)=>{window.searchFetchTimes.push(performance.now());return original(...args);};
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    input.value='본';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  });
  await page.waitForTimeout(400);expect(requests).toHaveLength(0);
  const response=page.waitForResponse(r=>r.url().includes('/api/posts'));
  await page.evaluate(()=>{
    const input=document.getElementById('searchInput');input.value='본문';
    window.compositionEndedAt=performance.now();
    input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'본문'}));
    input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:false}));
  });
  await response;await ready(page);await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  const delay=await page.evaluate(()=>window.searchFetchTimes[0]-window.compositionEndedAt);
  expect(delay).toBeGreaterThanOrEqual(299);await expect(page.locator('#status')).toContainText('1000건');
  fs.writeFileSync('docs/ime-evidence.json',JSON.stringify({compositionRequests:0,completedRequests:1,delayMs:delay},null,2));
});
test('검토 보완: HTTP 오류 안내와 조회 재시도', async ({page}) => {
  await page.goto('/');await ready(page);
  await page.route('**/api/posts?**',route=>route.fulfill({status:503,body:'temporary error'}),{times:1});
  await page.locator('#searchInput').fill('Redis');
  await expect(page.locator('#status')).toContainText('요청 실패: HTTP 503');
  await Promise.all([page.waitForResponse(r=>r.url().includes('search=Redis')),page.getByRole('button',{name:'조회',exact:true}).click()]);
  await ready(page);await expect(page.locator('#status')).toContainText('83건');
});
test('최종 확인: 검색 대기 중 뒤로가기 후 이전 상태 유지', async ({page}) => {
  await page.goto('/?page=3&sort=oldest');await ready(page);
  await search(page,'Redis');
  const requests=[];
  page.on('request',r=>{if(r.url().includes('/api/posts')) requests.push(r.url());});
  await page.locator('#searchInput').fill('AbortController');
  await page.goBack();await ready(page);await page.waitForTimeout(500);
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#sortSelect')).toHaveValue('oldest');
  await expect(page.locator('.page-btn.active')).toHaveText('3');
  await expect(page.locator('#tableBody tr').first().locator('td').first()).toHaveText('21');
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  expect(requests.some(url=>url.includes('search=AbortController'))).toBe(false);
});
test('최종 확인: 커서의 늦은 응답이 오프셋 화면을 바꾸지 않음', async ({page}) => {
  await page.addInitScript(()=>{
    const original=window.fetch;
    window.fetch=async(input,options={})=>{
      if(!String(input).includes('/cursor?')) return original(input,options);
      const response=await original(input,{...options,signal:undefined});
      await new Promise(r=>setTimeout(r,1000));
      return response;
    };
  });
  await page.goto('/?sort=oldest');await ready(page);
  await Promise.all([page.waitForRequest(r=>r.url().includes('/cursor?')),page.click('#tabCursor')]);
  await page.click('#tabOffset');await ready(page);await page.waitForTimeout(1200);
  await expect(page.locator('#sortSelect')).toBeEnabled();
  await expect(page.locator('#sortSelect')).toHaveValue('oldest');
  await expect(page.locator('#tableBody tr')).toHaveCount(10);
  await expect(page.locator('#tableBody tr').first().locator('td').first()).toHaveText('1');
  await expect(page.locator('#inspectUrl')).not.toContainText('/cursor');
  await expect(page.locator('#status')).toContainText('검색 결과 1000건');
});
