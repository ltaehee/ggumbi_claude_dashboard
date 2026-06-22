import 'dotenv/config';

const key = process.env.NOTION_API_KEY;
const dbId = process.env.NOTION_DATABASE_ID;

console.log('NOTION_API_KEY set:', !!key);
console.log('NOTION_DATABASE_ID set:', !!dbId);

if (!key || !dbId) {
  console.error('환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

try {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
    },
  });
  const data = await res.json();

  if (data.object === 'error') {
    console.error('Notion API Error:', data.code, data.message);
    process.exit(1);
  }

  console.log('\n✅ 노션 연결 성공!');
  console.log('DB 제목:', data.title?.[0]?.plain_text ?? '(제목 없음)');
  console.log('\n속성 목록:');
  Object.entries(data.properties || {}).forEach(([name, prop]) => {
    console.log(`  - "${name}" : ${prop.type}`);
  });

  // 첫 번째 페이지 샘플 조회
  console.log('\n--- 첫 번째 행 샘플 ---');
  const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 1 }),
  });
  const queryData = await queryRes.json();
  if (queryData.results?.length > 0) {
    const page = queryData.results[0];
    console.log('페이지 ID:', page.id);
    Object.entries(page.properties || {}).forEach(([name, prop]) => {
      let val = '(파싱 필요)';
      if (prop.type === 'title') val = prop.title?.[0]?.plain_text ?? '';
      else if (prop.type === 'rich_text') val = prop.rich_text?.[0]?.plain_text ?? '';
      else if (prop.type === 'date') val = JSON.stringify(prop.date);
      else if (prop.type === 'number') val = String(prop.number ?? '');
      else if (prop.type === 'select') val = prop.select?.name ?? '';
      else if (prop.type === 'multi_select') val = prop.multi_select?.map(s => s.name).join(', ') ?? '';
      else if (prop.type === 'checkbox') val = String(prop.checkbox);
      else if (prop.type === 'status') val = prop.status?.name ?? '';
      console.log(`  "${name}" [${prop.type}]: ${val}`);
    });
  } else {
    console.log('(데이터 없음)');
  }
} catch (e) {
  console.error('오류:', e.message);
  process.exit(1);
}
