document.addEventListener('DOMContentLoaded', async () => {
    const typeSelect = document.getElementById('deviceType');
    const featuresContainer = document.getElementById('featuresContainer');

    // 渲染功能 Checkbox
    async function renderFeatures(deviceType) {
        featuresContainer.innerHTML = '<p>載入中...</p>';
        try {
            const response = await fetch(`/api/features/${deviceType}`);
            const data = await response.json();
            
            featuresContainer.innerHTML = ''; // 清空
            
            if (!data.features || data.features.length === 0) {
                featuresContainer.innerHTML = '<p style="color: #666; margin-top: 10px;">目前此家電類型尚無設定檔，請聯絡開發人員新增。 (e.g. config/features/' + deviceType + '.json)</p>';
                return;
            }

            // 將 features 依據 availableModes 進行分組
            const groups = {};
            data.features.forEach(feat => {
                let groupName = 'CommonSetting';
                // 找出是否有 availableModes 條件
                if (feat.checks && feat.checks.length > 0) {
                    const checkWithMode = feat.checks.find(c => c.condition && c.condition.availableModes);
                    if (checkWithMode) {
                        groupName = checkWithMode.condition.availableModes;
                    }
                }
                
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(feat);
            });

            // 渲染各個群組
            for (const [groupName, features] of Object.entries(groups)) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'feature-group';
                
                const groupTitle = document.createElement('h3');
                groupTitle.textContent = groupName;
                groupDiv.appendChild(groupTitle);

                features.forEach(feat => {
                    const label = document.createElement('label');
                    label.className = 'checkbox-item';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = feat.id;
                    cb.className = 'feature-checkbox';
                    if (feat.default_checked) {
                        cb.checked = true;
                    }
                    
                    label.appendChild(cb);
                    
                    const span = document.createElement('span');
                    span.textContent = ' ' + feat.label;
                    label.appendChild(span);

                    if (feat.inputType === 'text') {
                        const textInput = document.createElement('input');
                        textInput.type = 'text';
                        textInput.id = `input_${feat.id}`;
                        textInput.value = feat.type_default || '';
                        textInput.className = 'feature-text-input';
                        label.appendChild(textInput);
                    }

                    groupDiv.appendChild(label);
                });
                
                featuresContainer.appendChild(groupDiv);
            }
        } catch (e) {
            featuresContainer.innerHTML = '<p style="color: red;">載入功能清單失敗</p>';
        }
    }

    let currentMissingChecks = [];

    function renderReport(results) {
        document.getElementById('reportSection').style.display = 'block';
        const tbody = document.getElementById('reportBody');
        tbody.innerHTML = '';
        currentMissingChecks = [];

        results.forEach(res => {
            const tr = document.createElement('tr');
            let statusClass = '';
            if (res.status === 'pass') {
                statusClass = 'status-pass';
            } else if (res.status === 'error') {
                statusClass = 'status-error';
                if (res.condition) {
                    currentMissingChecks.push({
                        table: res.table,
                        condition: res.condition,
                        featureLabel: res.feature,
                        desc: res.desc
                    });
                }
            } else if (res.status === 'warning') {
                statusClass = 'status-warning';
            }

            tr.innerHTML = `
                <td>${res.feature}</td>
                <td>${res.table}</td>
                <td>${res.desc}</td>
                <td class="${statusClass}">${res.message}</td>
            `;
            tbody.appendChild(tr);
        });

        // 處理 SQL 產出區塊顯示
        const sqlBlock = document.getElementById('sqlBlock');
        const sqlOutput = document.getElementById('sqlOutput');
        if (currentMissingChecks.length > 0) {
            sqlBlock.style.display = 'block';
            sqlOutput.style.display = 'none';
            sqlOutput.value = '';
        } else {
            sqlBlock.style.display = 'none';
        }
    }

    let historyData = [];
    async function loadHistory() {
        try {
            const response = await fetch('/api/history');
            historyData = await response.json();
            const select = document.getElementById('historySelect');
            select.innerHTML = '<option value="">-- 選擇歷史紀錄以自動還原 --</option>';
            historyData.forEach((record, index) => {
                const dateStr = new Date(record.timestamp).toLocaleString();
                const option = document.createElement('option');
                option.value = index;
                const folderName = record.folderPath ? record.folderPath.split(/[/\\]/).filter(Boolean).pop() : '未知路徑';
                option.textContent = `[${dateStr}] 機種: ${record.modelId} (${record.deviceType}) - ${folderName}`;
                select.appendChild(option);
            });
        } catch (e) {
            console.error('載入歷史紀錄失敗', e);
        }
    }

    // 載入下拉選單設定
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        config.deviceTypes.forEach(dt => {
            const option = document.createElement('option');
            option.value = dt.id;
            option.textContent = dt.name;
            typeSelect.appendChild(option);
        });

        if (config.defaults) {
            if (config.defaults.folderPath) document.getElementById('folderPath').value = config.defaults.folderPath;
            if (config.defaults.modelId) document.getElementById('modelId').value = config.defaults.modelId;
        }

        // 綁定切換事件
        typeSelect.addEventListener('change', (e) => {
            renderFeatures(e.target.value);
            // 切換家電類型時，清空比對報告區塊
            document.getElementById('reportSection').style.display = 'none';
        });

        // 初始載入第一個家電的功能
        if (config.deviceTypes.length > 0) {
            renderFeatures(config.deviceTypes[0].id);
        }

        loadHistory();

        document.getElementById('historySelect').addEventListener('change', async (e) => {
            const index = e.target.value;
            if (index === '') return;
            const record = historyData[index];
            if (!record) return;

            // 1. 還原基本欄位
            document.getElementById('folderPath').value = record.folderPath;
            document.getElementById('modelId').value = record.modelId;
            document.getElementById('deviceType').value = record.deviceType;

            // 2. 重新渲染該家電的 Checkbox (等待完成)
            await renderFeatures(record.deviceType);

            // 3. 還原勾選狀態與輸入框
            record.selectedFeatures.forEach(id => {
                const cb = document.querySelector(`.feature-checkbox[value="${id}"]`);
                if (cb) cb.checked = true;
                
                if (record.featureInputs && record.featureInputs[id] !== undefined) {
                    const input = document.getElementById(`input_${id}`);
                    if (input) input.value = record.featureInputs[id];
                }
            });

            // 4. 顯示歷史的比對報告
            renderReport(record.results);
        });

    } catch (e) {
        alert('無法載入設定檔，請確認後端 Server 是否正常運作');
    }

    // 處理比對按鈕點擊事件
    document.getElementById('checkBtn').addEventListener('click', async () => {
        const folderPath = document.getElementById('folderPath').value.trim();
        const modelId = document.getElementById('modelId').value.trim();
        const deviceType = document.getElementById('deviceType').value;
        
        const checkboxes = document.querySelectorAll('.feature-checkbox:checked');
        const selectedFeatures = Array.from(checkboxes).map(cb => cb.value);
        
        const featureInputs = {};
        // 將所有功能(無論是否有勾選)的輸入框數值都抓取，供反向檢測使用
        document.querySelectorAll('.feature-checkbox').forEach(cb => {
            const id = cb.value;
            const textInput = document.getElementById(`input_${id}`);
            if (textInput) {
                featureInputs[id] = textInput.value.trim();
            }
        });

        if (!folderPath || !modelId || selectedFeatures.length === 0) {
            alert('請填寫資料夾、機種名稱，並至少勾選一個功能');
            return;
        }

        try {
            const response = await fetch('/api/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath, modelId, deviceType, selectedFeatures, featureInputs })
            });
            
            const data = await response.json();
            if (data.error) {
                alert('錯誤: ' + data.error);
                return;
            }

            // 渲染比對結果表格
            renderReport(data.results);
            
            // 刷新歷史紀錄選單
            loadHistory();

        } catch (e) {
            alert('執行比對時發生系統錯誤，請查看後端 Log');
        }
    });

    document.getElementById('generateSqlBtn').addEventListener('click', async () => {
        if (currentMissingChecks.length === 0) return;
        
        const deviceType = document.getElementById('deviceType').value;
        const modelId = document.getElementById('modelId').value.trim();
        const sqlOutput = document.getElementById('sqlOutput');
        
        try {
            const response = await fetch('/api/generate-sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missingChecks: currentMissingChecks, deviceType, modelId })
            });
            const data = await response.json();
            
            if (data.error) {
                alert('產生 SQL 失敗: ' + data.error);
                return;
            }
            
            sqlOutput.value = data.sql;
            sqlOutput.style.display = 'block';
            
            // 自動滾動到底部
            sqlOutput.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            alert('產生 SQL 時發生網路錯誤');
        }
    });
});
