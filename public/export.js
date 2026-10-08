document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportReportBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', async () => {
        // 複製目前整個網頁的 DOM 結構
        const clone = document.documentElement.cloneNode(true);

        // 內嵌 CSS 樣式，確保下載後本機開啟時外觀不會跑掉
        try {
            const cssResponse = await fetch('style.css');
            const cssText = await cssResponse.text();
            const styleTag = document.createElement('style');
            styleTag.textContent = cssText;
            clone.querySelector('head').appendChild(styleTag);
            
            // 移除原本外部參考的 link
            const oldLink = clone.querySelector('link[rel="stylesheet"]');
            if (oldLink) oldLink.remove();
        } catch (e) {
            console.error('無法內嵌 CSS', e);
        }

        // 因為 cloneNode 不會複製輸入框的動態狀態 (value, checked)，需要手動覆寫
        const originalInputs = document.querySelectorAll('input, select, textarea');
        const clonedInputs = clone.querySelectorAll('input, select, textarea');

        originalInputs.forEach((orig, index) => {
            const cloned = clonedInputs[index];
            if (!cloned) return;

            if (orig.type === 'checkbox' || orig.type === 'radio') {
                const iconSpan = document.createElement('span');
                iconSpan.style.fontWeight = 'bold';
                iconSpan.style.marginRight = '5px';
                iconSpan.style.fontSize = '16px';
                
                if (orig.checked) {
                    iconSpan.textContent = '✔';
                    iconSpan.style.color = '#28a745'; // 綠色勾勾
                } else {
                    iconSpan.textContent = '✘';
                    iconSpan.style.color = '#dc3545'; // 紅色叉叉
                }
                
                if (cloned.parentNode) {
                    cloned.parentNode.replaceChild(iconSpan, cloned);
                }
            } else if (orig.tagName.toLowerCase() === 'textarea') {
                cloned.textContent = orig.value;
            } else {
                cloned.setAttribute('value', orig.value);
            }
        });

        // 2. 將文字輸入框替換為粗體純文字
        clonedInputs.forEach((cloned) => {
            if (cloned.type === 'text' || cloned.tagName.toLowerCase() === 'select') {
                const span = document.createElement('span');
                span.textContent = cloned.value || cloned.getAttribute('value') || '(未填寫)';
                span.style.fontWeight = 'bold'; // 粗體顯示
                span.style.color = '#2c3e50';
                span.style.padding = '0 5px';
                
                // 將 input 或 select 替換為該 span
                if (cloned.parentNode) {
                    cloned.parentNode.replaceChild(span, cloned);
                }
            }
        });

        // 提取所需資訊供「單行摘要列」使用
        const modelId = document.getElementById('modelId').value.trim() || '未填寫';
        const folderPath = document.getElementById('folderPath').value.trim() || '未填寫';
        const deviceSelect = document.getElementById('deviceType');
        const deviceTypeName = deviceSelect.options[deviceSelect.selectedIndex]?.text || '未知家電';
        
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const displayTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        // 將 top-layout 替換為單行美化摘要列
        const topLayout = clone.querySelector('.top-layout');
        if (topLayout) {
            const summaryBar = document.createElement('div');
            summaryBar.className = 'section'; // 套用與底下一樣的標準格式
            summaryBar.style.display = 'flex';
            summaryBar.style.justifyContent = 'space-between';
            summaryBar.style.alignItems = 'center';
            
            summaryBar.innerHTML = `
                <div style="flex: 1;"><strong>[比對時間]</strong> ${displayTime}</div>
                <div style="flex: 1; text-align: center;"><strong>[檢測機種]</strong> ${modelId} (${deviceTypeName})</div>
                <div style="flex: 1; text-align: right;"><strong>[資料庫資料]</strong> ${folderPath}</div>
            `;
            
            topLayout.parentNode.replaceChild(summaryBar, topLayout);
        }

        // 移除不必要的互動按鈕與元素 (包含 a 連結)
        const elementsToRemove = clone.querySelectorAll(
            'button, script, a'
        );
        elementsToRemove.forEach(el => el.remove());

        // 優化 SQL 輸出區塊在靜態報告中的呈現
        const sqlOutput = clone.querySelector('#sqlOutput');
        if (sqlOutput) {
            const pre = document.createElement('pre');
            pre.textContent = sqlOutput.textContent;
            pre.style.background = '#f8f9fa';
            pre.style.padding = '15px';
            pre.style.border = '1px solid #ddd';
            pre.style.borderRadius = '4px';
            pre.style.whiteSpace = 'pre-wrap';
            
            if (sqlOutput.parentNode) {
                sqlOutput.parentNode.replaceChild(pre, sqlOutput);
            }
        }

        // 組裝完整的 HTML 字串
        const htmlContent = '<!DOCTYPE html>\n' + clone.outerHTML;

        // 3. 檔名加上生成的時與分 (變數已於上方宣告)
        const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
        
        const filename = `比對報告_${modelId}_${dateStr}_${timeStr}.html`;

        // 觸發下載
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
});
