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
    
    // クエリオプションの作成（プロパティ名を確認して適切に設定）
    const queryOptions = {
      database_id: process.env.NOTION_DATABASE_ID
    };
    
    // ソートプロパティが存在する場合のみソートを追加
    if (debugInfo.propertyNames.includes("Order")) {
      queryOptions.sorts = [{ property: "Order", direction: "ascending" }];
    } else if (debugInfo.propertyNames.includes("order")) {
      queryOptions.sorts = [{ property: "order", direction: "ascending" }];
    } else {
      // 他の可能性のあるソートプロパティ名
      const possibleSortProps = debugInfo.propertyNames.filter(name => 
        name.toLowerCase() === "order" || 
        name.toLowerCase() === "順番" || 
        name.toLowerCase() === "順序"
      );
      
      if (possibleSortProps.length > 0) {
        queryOptions.sorts = [{ property: possibleSortProps[0], direction: "ascending" }];
        debugInfo.steps.push(`見つかったソートプロパティ: ${possibleSortProps[0]}`);
      } else {
        debugInfo.steps.push("ソート可能なプロパティが見つからないため、ソートなしでクエリを実行します");
      }
    }
    
    // クエリの実行
    const response = await notion.databases.query(queryOptions);
    debugInfo.steps.push("クエリ成功: " + response.results.length + "件のレコードを取得");
    
    // ステップ5: 画像URLの抽出
    debugInfo.steps.push("5. 画像データの抽出");
    
    // 最初のレコードの構造をデバッグ情報に追加（存在する場合）
    if (response.results.length > 0) {
      debugInfo.firstRecordProperties = Object.keys(response.results[0].properties);
      
      // 画像プロパティを探す
      const imageProperty = debugInfo.firstRecordProperties.find(prop => 
        response.results[0].properties[prop].type === "files"
      );
      
      if (imageProperty) {
        debugInfo.steps.push(`画像プロパティを発見: ${imageProperty}`);
        debugInfo.imageProperty = imageProperty;
      } else {
        debugInfo.steps.push("画像プロパティが見つかりません");
      }
    }
    
    // 画像URLの抽出
    const images = response.results.map(page => {
      // ページのプロパティからタイトルを探す
      const titleProp = Object.keys(page.properties).find(key => 
        page.properties[key].type === "title"
      );
      
      // 画像プロパティを探す
      const imageProp = debugInfo.imageProperty || Object.keys(page.properties).find(key => 
        page.properties[key].type === "files"
      );
      
      // データ抽出
      let imageUrl = '';
      let title = '';
      let order = 0;
      
      // タイトルの抽出
      if (titleProp && page.properties[titleProp].title && page.properties[titleProp].title.length > 0) {
        title = page.properties[titleProp].title[0]?.plain_text || '';
      }
      
      // 画像URLの抽出
      if (imageProp && page.properties[imageProp].files && page.properties[imageProp].files.length > 0) {
        const file = page.properties[imageProp].files[0];
        imageUrl = file.file?.url || file.external?.url || '';
      }
      
      // 順序の抽出（ソートプロパティがある場合）
      if (queryOptions.sorts && queryOptions.sorts.length > 0) {
        const sortProp = queryOptions.sorts[0].property;
        if (page.properties[sortProp] && page.properties[sortProp].number !== undefined) {
          order = page.properties[sortProp].number;
        }
      }
      
      return {
        id: page.id,
        imageUrl,
        title,
        order
      };
    }).filter(image => image.imageUrl); // 画像URLがあるものだけフィルタリング
    
    debugInfo.extractedImages = images.length;
    debugInfo.steps.push(`${images.length}件の画像を抽出しました`);
    
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