const { chromium } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async()=>{
 // 최신 테스트 결과로 HTML을 먼저 생성합니다.
 require('node:child_process').execFileSync('python3',['scripts/build-report.py']);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}});
  await page.goto(pathToFileURL(path.resolve('docs/evidence.html')).href);
  await page.screenshot({path:'docs/captures/07-test-evidence.png',fullPage:true});
  await page.goto(pathToFileURL(path.resolve('docs/report.html')).href);
  await page.pdf({path:'docs/report.pdf',format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{top:'14mm',bottom:'16mm',left:'14mm',right:'14mm'}});
  console.log('증거 캡처와 보고서 PDF 생성 완료');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
