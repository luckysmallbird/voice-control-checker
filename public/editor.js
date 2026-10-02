document.addEventListener('DOMContentLoaded', async () => {
    const fileSelect = document.getElementById('fileSelect');
    const editorArea = document.getElementById('editorArea');
    const saveBtn = document.getElementById('saveBtn');

    let currentMode = ''; // 'features' 或是 'raw'
    let featuresList = [];

    // 初始化：載入檔案列表
    async function fetchFiles() {
        try {
            const res = await fetch('/api/config-files');
            const files = await res.json();
            fileSelect.innerHTML = '<option value="">-- 請選擇檔案 --</option>';
            files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                fileSelect.appendChild(opt);
            });
        } catch (e) {
            alert('無法載入檔案清單');
        }
    }

    // 載入特定檔案內容
    async function loadFile(filePath) {
        editorArea.innerHTML = '<p style="text-align:center;">載入中...</p>';
        try {
            const res = await fetch(`/api/config-file?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();

            // 判斷是否為 feature 格式
            if (data && Array.isArray(data.features)) {
                currentMode = 'features';
                featuresList = data.features;
                renderCards();
            } else {
                currentMode = 'raw';
                renderRawEditor(data);
            }
        } catch (e) {
            editorArea.innerHTML = '<p style="color:red; text-align:center;">載入檔案失敗</p>';
        }
    }

    // 畫出所有 Feature 卡片
    function renderCards() {
        editorArea.innerHTML = '';

        // 全域展開/合併按鈕
        const controlsDiv = document.createElement('div');
        controlsDiv.style.marginBottom = '15px';
        controlsDiv.style.display = 'flex';
        controlsDiv.style.gap = '10px';
        
        const expandAllBtn = document.createElement('button');
        expandAllBtn.className = 'btn-secondary';
        expandAllBtn.textContent = '全部展開';
        expandAllBtn.onclick = () => document.querySelectorAll('.card-body').forEach(b => {
            b.style.display = 'block';
            const ta = b.querySelector('textarea');
            if (ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 5) + 'px'; }
        });
        
        const collapseAllBtn = document.createElement('button');
        collapseAllBtn.className = 'btn-secondary';
        collapseAllBtn.textContent = '全部合併';
        collapseAllBtn.onclick = () => document.querySelectorAll('.card-body').forEach(b => b.style.display = 'none');
        
        controlsDiv.appendChild(expandAllBtn);
        controlsDiv.appendChild(collapseAllBtn);
        editorArea.appendChild(controlsDiv);

        featuresList.forEach((feat, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            
            // 卡片標頭與按鈕
            const header = document.createElement('div');
            header.className = 'card-header';
            
            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = `[${index + 1}] ID: ${feat.id || '未命名'}`;
            header.appendChild(title);

            const actions = document.createElement('div');
            actions.className = 'card-actions';
            actions.onclick = (e) => e.stopPropagation(); // 避免點擊按鈕時觸發展開/合併

            const upBtn = document.createElement('button');
            upBtn.className = 'btn-secondary';
            upBtn.textContent = '往上';
            upBtn.onclick = () => moveCard(index, -1);
            
            const downBtn = document.createElement('button');
            downBtn.className = 'btn-secondary';
            downBtn.textContent = '往下';
            downBtn.onclick = () => moveCard(index, 1);

            const dupBtn = document.createElement('button');
            dupBtn.className = 'btn-info';
            dupBtn.textContent = '複製';
            dupBtn.onclick = () => duplicateCard(index);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-danger';
            delBtn.textContent = '刪除';
            delBtn.onclick = () => deleteCard(index);

            if (index > 0) actions.appendChild(upBtn);
            if (index < featuresList.length - 1) actions.appendChild(downBtn);
            actions.appendChild(dupBtn);
            actions.appendChild(delBtn);
            header.appendChild(actions);
            card.appendChild(header);

            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'card-body';
            bodyDiv.style.display = 'none'; // 預設折疊

            // 文字框
            const textarea = document.createElement('textarea');
            textarea.className = 'json-textarea';
            textarea.id = `textarea_${index}`;
            textarea.value = JSON.stringify(feat, null, 2);
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight + 5) + 'px';
            });
            bodyDiv.appendChild(textarea);

            // 錯誤訊息區塊
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-msg';
            errorMsg.id = `error_${index}`;
            bodyDiv.appendChild(errorMsg);

            card.appendChild(bodyDiv);

            header.onclick = () => {
                if (bodyDiv.style.display === 'none') {
                    bodyDiv.style.display = 'block';
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight + 5) + 'px';
                } else {
                    bodyDiv.style.display = 'none';
                }
            };

            editorArea.appendChild(card);
        });

        // 新增按鈕
        const addBtn = document.createElement('div');
        addBtn.className = 'add-btn-container';
        addBtn.textContent = '+ 新增空白功能 (Add Feature)';
        addBtn.onclick = () => {
            syncTextareasToMemory();
            featuresList.push({
                "id": "newFeature",
                "label": "新功能",
                "checks": []
            });
            renderCards();
        };
        editorArea.appendChild(addBtn);
    }

    // 畫出單純的 Raw Editor (給 default.json 等使用)
    function renderRawEditor(data) {
        editorArea.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><div class="card-title">純文字 JSON 編輯模式</div></div>`;
        
        const textarea = document.createElement('textarea');
        textarea.className = 'json-textarea';
        textarea.id = 'rawTextarea';
        textarea.value = JSON.stringify(data, null, 2);
        
        // 自動跟隨內容調整高度
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight + 5) + 'px';
        });
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-msg';
        errorMsg.id = 'error_raw';
        
        card.appendChild(textarea);
        card.appendChild(errorMsg);
        editorArea.appendChild(card);

        // 插入 DOM 後立刻觸發一次高度計算
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight + 5) + 'px';
    }

    // 將畫面上文字框的內容同步回記憶體 (以便移動或複製時資料不流失)
    function syncTextareasToMemory() {
        if (currentMode !== 'features') return true;
        let allValid = true;
        for (let i = 0; i < featuresList.length; i++) {
            const ta = document.getElementById(`textarea_${i}`);
            const err = document.getElementById(`error_${i}`);
            try {
                featuresList[i] = JSON.parse(ta.value);
                err.style.display = 'none';
            } catch (e) {
                err.textContent = 'JSON 格式錯誤，請檢查引號或逗號是否遺漏！ (' + e.message + ')';
                err.style.display = 'block';
                allValid = false;
            }
        }
        return allValid;
    }

    function moveCard(index, dir) {
        if (!syncTextareasToMemory()) return;
        const temp = featuresList[index];
        featuresList[index] = featuresList[index + dir];
        featuresList[index + dir] = temp;
        renderCards();
    }

    function duplicateCard(index) {
        if (!syncTextareasToMemory()) return;
        const cloned = JSON.parse(JSON.stringify(featuresList[index]));
        cloned.id = cloned.id + '_copy';
        featuresList.splice(index + 1, 0, cloned);
        renderCards();
    }

    function deleteCard(index) {
        if (!confirm('確定要刪除這個功能嗎？')) return;
        if (!syncTextareasToMemory()) return;
        featuresList.splice(index, 1);
        renderCards();
    }

    // 儲存邏輯
    saveBtn.addEventListener('click', async () => {
        const filePath = fileSelect.value;
        if (!filePath) {
            alert('請先選擇檔案');
            return;
        }

        let payloadToSave;

        if (currentMode === 'features') {
            if (!syncTextareasToMemory()) {
                alert('有卡片的 JSON 格式錯誤，請修正紅色提示後再儲存！');
                return;
            }
            payloadToSave = { features: featuresList };
        } else {
            const rawTa = document.getElementById('rawTextarea');
            const rawErr = document.getElementById('error_raw');
            try {
                payloadToSave = JSON.parse(rawTa.value);
                rawErr.style.display = 'none';
            } catch (e) {
                rawErr.textContent = 'JSON 格式錯誤 (' + e.message + ')';
                rawErr.style.display = 'block';
                alert('JSON 格式錯誤，請修正後再儲存！');
                return;
            }
        }

        try {
            const res = await fetch('/api/config-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: payloadToSave })
            });
            const result = await res.json();
            if (result.success) {
                alert('儲存成功！');
            } else {
                alert('儲存失敗：' + result.error);
            }
        } catch (e) {
            alert('發生系統錯誤');
        }
    });

    fileSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            loadFile(e.target.value);
        } else {
            editorArea.innerHTML = '<p style="text-align: center; color: #666;">請從上方選擇要編輯的設定檔。</p>';
        }
    });

    fetchFiles();
});
