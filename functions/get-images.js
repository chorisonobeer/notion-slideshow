const { Client } = require('@notionhq/client');

exports.handler = async function(event, context) {
  // CORSヘッダーを設定
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // デバッグ情報を保存するオブジェクト
  const debugInfo = {
    apiKey: process.env.NOTION_SECRET ? "設定されています（セキュリティのため表示しません）" : "設定されていません",
    databaseId: process.env.NOTION_DATABASE_ID || "設定されていません",
    steps: []
  };
  
  try {
    // ステップ1: 環境変数の確認
    debugInfo.steps.push("1. 環境変数の確認");
    if (!process.env.NOTION_SECRET) {
      throw new Error("Notion API キーが設定されていません");
    }
    if (!process.env.NOTION_DATABASE_ID) {
      throw new Error("Notion データベースIDが設定されていません");
    }
    
    // ステップ2: Notionクライアントの初期化
    debugInfo.steps.push("2. Notionクライアントの初期化");
    const notion = new Client({
      auth: process.env.NOTION_SECRET
    });
    
    // ステップ3: データベース情報の取得（デバッグ用）
    debugInfo.steps.push("3. データベース情報の取得");
    try {
      const dbInfo = await notion.databases.retrieve({
        database_id: process.env.NOTION_DATABASE_ID
      });
      debugInfo.databaseName = dbInfo.title[0]?.plain_text || "名称不明";
      debugInfo.propertyNames = Object.keys(dbInfo.properties);
      debugInfo.steps.push("データベース取得成功: " + debugInfo.databaseName);
      
      // プロパティの詳細をログに記録
      debugInfo.properties = {};
      Object.keys(dbInfo.properties).forEach(key => {
        debugInfo.properties[key] = {
          type: dbInfo.properties[key].type,
          id: dbInfo.properties[key].id
        };
      });
    } catch (dbError) {
      debugInfo.steps.push("データベース取得エラー: " + dbError.message);
      debugInfo.dbError = {
        code: dbError.code,
        message: dbError.message,
        status: dbError.status
      };
      throw dbError;
    }
    
    // ステップ4: データベースクエリの実行
    debugInfo.steps.push("4. データベースのクエリ実行");
    
    // クエリオプションの作成
    const queryOptions = {
      database_id: process.env.NOTION_DATABASE_ID
    };
    
    // ソートプロパティの検出と設定
    // "Order", "order", "順番" などの名前で検索
    const orderProperties = debugInfo.propertyNames.filter(name => 
      name.toLowerCase() === "order" || 
      name.toLowerCase() === "順番" || 
      name.toLowerCase() === "順序"
    );
    
    if (orderProperties.length > 0) {
      queryOptions.sorts = [{ property: orderProperties[0], direction: "ascending" }];
      debugInfo.steps.push(`ソートプロパティを検出: ${orderProperties[0]}`);
    } else {
      debugInfo.steps.push("ソートプロパティが見つからないため、ソートなしでクエリを実行します");
    }
    
    // クエリの実行
    const response = await notion.databases.query(queryOptions);
    debugInfo.steps.push(`クエリ成功: ${response.results.length}件のレコードを取得`);
    
    // デバッグ用に最初のレコードの構造を記録
    if (response.results.length > 0) {
      debugInfo.firstRecordId = response.results[0].id;
      debugInfo.firstRecordProperties = Object.keys(response.results[0].properties);
      
      // プロパティの詳細を記録
      debugInfo.firstRecordPropertyDetails = {};
      Object.keys(response.results[0].properties).forEach(key => {
        const prop = response.results[0].properties[key];
        debugInfo.firstRecordPropertyDetails[key] = {
          type: prop.type,
          value: prop[prop.type]
        };
      });
    }
    
    // ステップ5: 画像と時間データの抽出
    debugInfo.steps.push("5. データの抽出");
    
    // timeプロパティの検出
    let timePropertyName = null;
    const timeProperties = debugInfo.propertyNames.filter(name => 
      name.toLowerCase() === "time" || 
      name.toLowerCase() === "時間" || 
      name.toLowerCase() === "表示時間"
    );
    
    if (timeProperties.length > 0) {
      timePropertyName = timeProperties[0];
      debugInfo.steps.push(`時間プロパティを検出: ${timePropertyName}`);
    } else {
      debugInfo.steps.push("時間プロパティが見つかりません");
    }
    
    // 画像プロパティの検出
    let imagePropertyName = null;
    if (response.results.length > 0) {
      // filesタイプのプロパティを探す
      for (const key of Object.keys(response.results[0].properties)) {
        const prop = response.results[0].properties[key];
        if (prop.type === 'files') {
          imagePropertyName = key;
          debugInfo.steps.push(`画像プロパティを検出: ${imagePropertyName}`);
          break;
        }
      }
    }
    
    if (!imagePropertyName) {
      debugInfo.steps.push("画像プロパティが見つかりません");
    }
    
    // 画像URLとタイムデータの抽出
    const images = response.results.map(page => {
      // メタデータを準備
      let imageUrl = '';
      let title = '';
      let order = 0;
      let time = null;
      
      // タイトルの抽出（titleタイプのプロパティから）
      for (const key of Object.keys(page.properties)) {
        const prop = page.properties[key];
        if (prop.type === 'title' && prop.title && prop.title.length > 0) {
          title = prop.title[0]?.plain_text || '';
          break;
        }
      }
      
      // 画像URLの抽出
      if (imagePropertyName && page.properties[imagePropertyName] && 
          page.properties[imagePropertyName].files && 
          page.properties[imagePropertyName].files.length > 0) {
        const file = page.properties[imagePropertyName].files[0];
        imageUrl = file.file?.url || file.external?.url || '';
      }
      
      // 順序の抽出
      if (orderProperties.length > 0) {
        const orderProp = page.properties[orderProperties[0]];
        if (orderProp && orderProp.number !== undefined) {
          order = orderProp.number;
        }
      }
      
      // 時間の抽出
      if (timePropertyName && page.properties[timePropertyName] && 
          page.properties[timePropertyName].number !== undefined) {
        time = page.properties[timePropertyName].number;
      }
      
      return {
        id: page.id,
        imageUrl,
        title,
        order,
        time
      };
    }).filter(image => image.imageUrl); // 画像URLがあるものだけフィルタリング
    
    debugInfo.extractedImages = images.length;
    debugInfo.steps.push(`${images.length}件の画像を抽出しました`);
    
    // 各画像のtime値を記録（デバッグ用）
    debugInfo.imageTimes = images.map(img => ({
      id: img.id,
      time: img.time
    }));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        images,
        debug: debugInfo 
      })
    };
  } catch (error) {
    console.error('Error:', error);
    debugInfo.steps.push("エラー発生: " + error.message);
    debugInfo.error = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack
    };
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Notionデータの取得に失敗しました', 
        details: error.message,
        debug: debugInfo
      })
    };
  }
};