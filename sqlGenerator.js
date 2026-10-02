// sqlGenerator.js

// 定義各個表格的欄位結構 (方便未來擴充)
const TABLE_SCHEMAS = {
    'AgentDevices': ['agentType', 'deviceType', 'modelId'],
    'Device_Command': ['deviceType', 'modelId', 'trait', 'parmsReq', 'valueReq', 'parmsRes', 'valueRes', 'Protocol', 'deviceOp', 'deviceValue', 'type', 'agentType', 'commands'],
    'Device_Attributes': ['agentType', 'deviceType', 'modelId', 'trait', 'attribute', 'value', 'traitType'],
    'Mode_Attributes': ['deviceType', 'modelId', 'availableModes', 'value', 'setting_name', 'deviceOp', 'deviceValue', 'ordered', 'CHT_Cmd', 'sequence'],
    'Attributes_Synonym': ['deviceType', 'traits', 'attributes', 'lang', 'synonym', 'description']
};

/**
 * 根據缺漏的檢查項目，產生對應的 PostgreSQL INSERT 語法
 * @param {Array} missingChecks - 缺漏的檢查物件陣列，包含 { table, condition, featureLabel, desc }
 * @param {String} deviceType - 家電類型 (例如 airDehumidifier)
 * @param {String} modelId - 機種名稱 (例如 QXK)
 * @returns {String} 產生的 SQL 字串
 */
function generateSQL(missingChecks, deviceType, modelId) {
    if (!missingChecks || missingChecks.length === 0) return '-- 沒有缺漏資料，無需產出 SQL';

    let sqlLines = [];
    
    sqlLines.push('-- =========================================');
    sqlLines.push(`-- 自動產生 ${modelId} (${deviceType}) 的缺漏資料 SQL (PostgreSQL)`);
    sqlLines.push('-- 注意：部分欄位 (如底層十六進位代碼 deviceValue) 請手動填上正確的數值');
    sqlLines.push('-- =========================================\n');

    missingChecks.forEach(check => {
        const table = check.table;
        const schema = TABLE_SCHEMAS[table];
        
        if (!schema) {
            sqlLines.push(`-- [未知表格] 無法為 ${table} 產生 SQL`);
            return;
        }

        // 預設資料 (融合全域變數與 condition 特徵)
        const rowData = { ...check.condition };
        // 針對有這兩個欄位的表格，補上前端傳來的大前提
        if (schema.includes('deviceType')) rowData.deviceType = deviceType;
        if (schema.includes('modelId')) rowData.modelId = modelId;

        // 組裝 Values
        const values = schema.map(col => {
            const val = rowData[col];
            if (val === undefined || val === null) {
                return "''"; // 若 condition 沒定義，預設給空字串作為 Stub
            }
            // 處理 PostgreSQL 的單引號跳脫 (用兩個單引號代表一個)
            return `'${String(val).replace(/'/g, "''")}'`;
        });

        // 加上雙引號避免大小寫表格名問題 (視您的 Postgres 設定而定，一般安全做法)
        const sql = `INSERT INTO "${table}" (${schema.join(', ')}) VALUES (${values.join(', ')});`;
        
        // 加上註解說明這是補哪個功能的
        sqlLines.push(`-- 補齊: ${check.featureLabel || ''} - ${check.desc || ''}`);
        sqlLines.push(sql);
        sqlLines.push(''); // 空行分隔
    });

    return sqlLines.join('\n');
}

module.exports = { generateSQL };
