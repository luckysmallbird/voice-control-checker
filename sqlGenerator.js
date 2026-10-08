// sqlGenerator.js

// 定義各個表格的欄位結構 (方便未來擴充)
const TABLE_SCHEMAS = {
    'AgentDevices': ['agentType', 'deviceType', 'modelId'],
    'Device_Command': ['deviceType', 'modelId', 'trait', 'parmsReq', 'valueReq', 'parmsRes', 'valueRes', 'Protocol', 'deviceOp', 'deviceValue', 'type', 'agentType', 'commands'],
    'Device_Attributes': ['agentType', 'deviceType', 'modelId', 'trait', 'attribute', 'value', 'traitType'],
    'Mode_Attributes': ['deviceType', 'modelId', 'availableModes', 'value', 'setting_name', 'deviceOp', 'deviceValue', 'ordered', 'CHT_Cmd', 'sequence'],
    'Attributes_Synonym': ['deviceType', 'traits', 'attributes', 'lang', 'synonym', 'description']
};

const path = require('path');
const fs = require('fs');

let sqlDefaults = {};
try {
    const defaultsPath = path.join(__dirname, 'config', 'sql_defaults.json');
    if (fs.existsSync(defaultsPath)) {
        sqlDefaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load sql_defaults.json', e);
}

// 尋找對應的預設值
function findDefaults(table, deviceType, condition) {
    if (!sqlDefaults[table]) return null;
    
    // 將該模組類型與 ALL 通用的預設值合併作為尋找池 (優先使用特定模組類型)
    const searchPool = { ...(sqlDefaults[table]['ALL'] || {}), ...(sqlDefaults[table][deviceType] || {}) };
    
    // 將 condition 轉換為比對的 key 格式
    let conditionKeys = [];
    if (condition.availableModes) conditionKeys.push(`availableModes=${condition.availableModes}`);
    if (condition.value && condition.value !== '{INPUT_VALUE}') conditionKeys.push(`value=${condition.value}`);
    if (condition.setting_name && condition.setting_name !== '{INPUT_VALUE}') conditionKeys.push(`setting_name=${condition.setting_name}`);
    if (condition.trait) conditionKeys.push(`trait=${condition.trait}`);
    if (condition.attribute) conditionKeys.push(`attribute=${condition.attribute}`);
    
    const searchKey = conditionKeys.join('&');
    return searchPool[searchKey] || null;
}

/**
 * 根據缺漏的檢查項目，產生對應的 PostgreSQL INSERT 語法
 * @param {Array} missingChecks - 缺漏的檢查物件陣列，包含 { table, condition, featureLabel, desc }
 * @param {String} deviceType - 模組類型 (例如 ModuleA)
 * @param {String} modelId - 目標名稱 (例如 TARGET_01)
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

        // 嘗試從字典檔找尋預設值
        const defaults = findDefaults(table, deviceType, check.condition) || {};
        
        let hasConflict = false;
        let conflictCols = [];

        // 預設資料 (融合全域變數與 condition 特徵)
        const rowData = { ...check.condition };
        // 針對有這兩個欄位的表格，補上前端傳來的大前提
        if (schema.includes('deviceType')) rowData.deviceType = deviceType;
        if (schema.includes('modelId')) rowData.modelId = modelId;

        // 組裝 Values
        const values = schema.map(col => {
            let val = rowData[col];
            
            // 如果 condition 沒定義，嘗試從字典拿預設值
            if (val === undefined || val === null) {
                val = defaults[col];
            }

            // 如果字典裡標示為衝突，則強制清空並記錄
            if (val === '_CONFLICT_') {
                hasConflict = true;
                conflictCols.push(col);
                val = '';
            }

            if (val === undefined || val === null) {
                return "''"; // 若都沒定義，給空字串
            }
            
            // 處理 PostgreSQL 的單引號跳脫 (用兩個單引號代表一個)
            return `'${String(val).replace(/'/g, "''")}'`;
        });

        // 加上雙引號避免大小寫表格名與欄位名問題 (PostgreSQL 會將沒加引號的欄位轉小寫)
        const quotedSchema = schema.map(col => `"${col}"`);
        const sql = `INSERT INTO "${table}" (${quotedSchema.join(', ')}) VALUES (${values.join(', ')});`;
        
        // 加上註解說明這是補哪個功能的
        sqlLines.push(`-- 補齊: ${check.featureLabel || ''} - ${check.desc || ''}`);
        
        // 若有衝突，印出警告註解
        if (hasConflict) {
            sqlLines.push(`-- 警告：此功能有不只一種可能 (不同型號代碼不同)，請自行查閱 SPEC 填寫下列欄位: ${conflictCols.join(', ')}`);
        }
        
        sqlLines.push(sql);
        sqlLines.push(''); // 空行分隔
    });

    return sqlLines.join('\n');
}

module.exports = { generateSQL };
