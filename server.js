const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const app = express();
const port = 30530;

app.use(express.static('public'));
app.use(express.json());

// 取得設定檔 (回傳下拉選單用的家電清單)
app.get('/api/config', (req, res) => {
    try {
        const deviceTypes = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'device_types.json')));
        res.json({ deviceTypes });
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

// 執行比對邏輯
app.post('/api/check', async (req, res) => {
    const { folderPath, modelId, deviceType, selectedFeatures } = req.body;
    
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
        
        // 展開勾選的功能檢查項目
        for (const feature of featuresConfig.features || []) {
            if (selectedFeatures.includes(feature.id)) {
                feature.checks.forEach(check => {
                    allChecks.push({
                        featureLabel: feature.label,
                        ...check
                    });
                });
            }
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
                results.push({
                    feature: check.featureLabel,
                    table: check.table,
                    desc: check.desc,
                    status: 'error',
                    message: '找不到對應的 CSV 或檔案無內容'
                });
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
                    if (row.modelId === modelId) {
                        exactMatch = true;
                        break; // 完全命中特定型號，不用再找了
                    } else if (row.modelId === 'ALL' || row.modelId === '*') {
                        fallbackMatch = true; // 命中通用型號
                    }
                }
            }

            if (exactMatch) {
                results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, status: 'pass', message: '資料齊全' });
            } else if (fallbackMatch) {
                results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, status: 'pass', message: 'Pass (use ALL)' });
            } else {
                results.push({ feature: check.featureLabel, table: check.table, desc: check.desc, status: 'error', message: '缺少資料設定' });
            }
        }

        res.json({ results });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`系統啟動成功！請打開瀏覽器輸入 http://localhost:${port}`);
});
