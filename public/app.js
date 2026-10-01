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

            const groupDiv = document.createElement('div');
            groupDiv.className = 'feature-group';
            
            data.features.forEach(feat => {
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = feat.id;
                cb.className = 'feature-checkbox';
                
                label.appendChild(cb);
                label.appendChild(document.createTextNode(' ' + feat.label));

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
        } catch (e) {
            featuresContainer.innerHTML = '<p style="color: red;">載入功能清單失敗</p>';
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
        selectedFeatures.forEach(id => {
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
            document.getElementById('reportSection').style.display = 'block';
            const tbody = document.getElementById('reportBody');
            tbody.innerHTML = '';

            data.results.forEach(res => {
                const tr = document.createElement('tr');
                
                let statusClass = '';
                if (res.status === 'pass') statusClass = 'status-pass';
                else if (res.status === 'error') statusClass = 'status-error';

                tr.innerHTML = `
                    <td>${res.feature}</td>
                    <td>${res.table}</td>
                    <td>${res.desc}</td>
                    <td class="${statusClass}">${res.message}</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (e) {
            alert('執行比對時發生系統錯誤，請查看後端 Log');
        }
    });
});
