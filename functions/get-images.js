const { Client } = require('@notionhq/client');
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // CORSヘッダーを設定
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  try {
    // Notionクライアントを初期化
    const notion = new Client({
      auth: process.env.NOTION_SECRET
    });
    
    // Notionデータベースからデータを取得
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      sorts: [
        {
          property: 'Order',
          direction: 'ascending'
        }
      ]
    });
    
    // データベースの結果を確認
    console.log('Database response:', JSON.stringify(response, null, 2));
    
    // 画像URLを抽出
    const images = response.results.map(page => {
      let imageUrl = '';
      
      // プロパティ名は実際のデータベース構造に合わせて調整する必要があります
      // ここでは "Image" という名前のプロパティを想定しています
      if (page.properties.Image && 
          page.properties.Image.files && 
          page.properties.Image.files.length > 0) {
        imageUrl = page.properties.Image.files[0].file?.url || page.properties.Image.files[0].external?.url || '';
      }
      
      return {
        id: page.id,
        imageUrl: imageUrl,
        title: page.properties.Title?.title[0]?.plain_text || '',
        order: page.properties.Order?.number || 0
      };
    }).filter(image => image.imageUrl); // 画像URLがあるものだけフィルタリング
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ images })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch images from Notion', details: error.message })
    };
  }
};