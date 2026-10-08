const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { generateSQL } = require('./sqlGenerator');

const app = express();
const port = 30530;

app.use(express.static('public'));
app.use(express.json());

// 取得設定檔 (回傳下拉選單用的家電清單)
app.get('/api/config', (req, res) => {
    try {
        const deviceTypes = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'device_types.json')));
        let defaults = {};
        const defaultPath = path.join(__dirname, 'config', 'default.json');
        if (fs.existsSync(defaultPath)) {
            defaults = JSON.parse(fs.readFileSync(defaultPath));
        }
        res.json({ deviceTypes, defaults });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 根據 deviceType 取得對應的 features 設定
app.get('/api/features/:deviceType', (req, res) => {
    try {
        const featurePath = path.join(__dirname, 'config', 'features', `${req.params.deviceType}.json`);
        if (fs.existsSync(featurePath)) {
            const featuresConfig = JSON.parse(fs.readFileSync(featurePath));
            res.json(featuresConfig);
        } else {
            res.json({ features: [] });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 讀取 CSV 內容
function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        if (!fs.existsSync(filePath)) {
            resolve([]);
            return;
        }
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

// 取得歷史比對紀錄
app.get('/api/history', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'config', 'userlog.jsonl');
        if (!fs.existsSync(logPath)) {
            return res.json([]);
        }
        const fileContent = fs.readFileSync(logPath, 'utf8');
        const lines = fileContent.trim().split('\n');
        const history = lines.filter(line => line).map(line => JSON.parse(line));
        res.json(history.reverse());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ====== Editor API ======

// 取得所有設定檔清單
app.get('/api/config-files', (req, res) => {
    try {
        const configDir = path.join(__dirname, 'config');
        const featuresDir = path.join(__dirname, 'config', 'features');
        let files = [];
        
        if (fs.existsSync(configDir)) {
            const rootFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
            files.push(...rootFiles);
        }
        if (fs.existsSync(featuresDir)) {
            const featureFiles = fs.readdirSync(featuresDir).filter(f => f.endsWith('.json')).map(f => `features/${f}`);
            files.push(...featureFiles);
        }
        res.json(files);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 讀取單一設定檔
app.get('/api/config-file', (req, res) => {
    try {
        const targetPath = req.query.path;
        if (!targetPath || targetPath.includes('..')) return res.status(400).json({error: '無效的路徑'});
        const fullPath = path.join(__dirname, 'config', targetPath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({error: '檔案不存在'});
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json(JSON.parse(content));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 儲存設定檔
app.post('/api/config-file', (req, res) => {
    try {
        const { path: targetPath, content } = req.body;
        if (!targetPath || targetPath.includes('..')) return res.status(400).json({error: '無效的路徑'});
        const fullPath = path.join(__dirname, 'config', targetPath);
        
        // 確保目錄存在
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(fullPath, JSON.stringify(content, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================

// SQL 產生器 API
app.post('/api/generate-sql', (req, res) => {
    try {
        const { missingChecks, deviceType, modelId } = req.body;
        const sql = generateSQL(missingChecks, deviceType, modelId);
        res.json({ sql });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 執行比對邏輯
app.post('/api/check', async (req, res) => {
    const { folderPath, modelId, deviceType, selectedFeatures, featureInputs = {} } = req.body;
    
    const targetFolder = path.resolve(folderPath);
    if (!fs.existsSync(targetFolder)) {
        return res.status(400).json({ error: '找不到該資料夾路徑' });
    }

    try {
        const featurePath = path.join(__dirname, 'config', 'features', `${deviceType}.json`);
        if (!fs.existsSync(featurePath)) {
            return res.status(400).json({ error: '找不到該家電類型的功能設定檔' });
        }
        
        const featuresConfig = JSON.parse(fs.readFileSync(featurePath));
        let allChecks = [];
        
        // 展開所有功能檢查項目 (區分勾選與未勾選)
        for (const feature of featuresConfig.features || []) {
            const isSelected = selectedFeatures.includes(feature.id);
            feature.checks.forEach(check => {
                const finalCondition = {};
                for (const [k, v] of Object.entries(check.condition)) {
                    if (typeof v === 'string' && v === '{INPUT_VALUE}') {
                        finalCondition[k] = featureInputs[feature.id] || '';
                    } else {
                        finalCondition[k] = v;
                    }
                }
                allChecks.push({
                    featureLabel: feature.label,
                    table: check.table,
                    desc: check.desc,
                    condition: finalCondition,
                    isNegative: !isSelected
                });
            });
        }

        // 整理需要讀取的表格
        const requiredTables = [...new Set(allChecks.map(c => c.table))];
        const db = {};
        for (const table of requiredTables) {
            const csvPath = path.join(targetFolder, `${table}.csv`);
            db[table] = await readCSV(csvPath);
        }

        const results = [];
        
        for (const check of allChecks) {
            const tableData = db[check.table];
            if (tableData.length === 0) {
                if (!check.isNegative) {
                    results.push({
                        feature: check.featureLabel,
                        table: check.table,
                        desc: check.desc,
                        condition: check.condition,
                        status: 'error',
                        message: '找不到對應的 CSV 或檔案無內容'
                    });
                }
                continue;
            }

            let exactMatch = false;
            let fallbackMatch = false;

            for (const row of tableData) {
                // 過濾不是這個家電類型的資料 (排除沒有 deviceType 欄位的例外表)
                if (row.deviceType && row.deviceType !== deviceType) continue;
                
                // 檢查 condition 條件是否完全吻合 (嚴格比對)
                let conditionMet = true;
                for (const [k, v] of Object.entries(check.condition)) {
                    if (row[k] !== v) {
                        conditionMet = false;
                        break;
                    }
                }

                // 如果符合條件，檢查是否有這台機器
                if (conditionMet) {
                    // 若該表格根本沒有 modelId 欄位 (例如同義詞表)，則視為符合 (Global Match)
                    if (row.modelId === undefined) {
                        exactMatch = true;
                        break;
                    } else if (row.modelId === modelId) {
                        exactMatch = true;
                        break; // 完全命中特定型號，不用再找了
                    } else if (row.modelId === 'ALL' || row.modelId === '*') {
                        fallbackMatch = true; // 命中通用型號
                    }
                }
            }

            if (!check.isNegative) {
                // 正向檢測 (使用者有勾選)
                if (exactMatch) {
                    results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, condition: check.condition, status: 'pass', message: 'Pass' });
                } else if (fallbackMatch) {
                    results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, condition: check.condition, status: 'pass', message: 'Pass (use ALL)' });
                } else {
                    results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, condition: check.condition, status: 'error', message: 'Not Found' });
                }
            } else {
                // 反向檢測 (使用者未勾選)
                // 只有在資料庫「有找到」時，才需要跳出過多警告
                if (exactMatch) {
                    results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, condition: check.condition, status: 'warning', message: 'use by EXACT MATCH (多餘設定)' });
                } else if (fallbackMatch) {
                    results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, condition: check.condition, status: 'warning', message: 'use by ALL' });
                }
            }
        }

        // 記錄到 userlog.jsonl
        const logEntry = {
            timestamp: new Date().toISOString(),
            folderPath,
            modelId,
            deviceType,
            selectedFeatures,
            featureInputs,
            results
        };
        fs.appendFileSync(path.join(__dirname, 'config', 'userlog.jsonl'), JSON.stringify(logEntry) + '\n', 'utf8');

        res.json({ results });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`系統啟動成功！請打開瀏覽器輸入 http://localhost:${port}`);
});
