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
        const folderPathRaw = document.getElementById('folderPath').value.trim() || '未填寫';
        let folderName = folderPathRaw;
        if (folderName !== '未填寫') {
            // 支援反斜線與正斜線，去除尾部多餘斜線後取最後一個節點當作資料夾名稱
            const parts = folderName.replace(/[/\\]+$/, '').split(/[/\\]/);
            folderName = parts[parts.length - 1] || folderPathRaw;
        }
        
        const deviceSelect = document.getElementById('deviceType');
        const deviceTypeName = deviceSelect.options[deviceSelect.selectedIndex]?.text || '未知家電';
        
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const displayTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        // 更新匯出報告的網頁標籤 (<title>) 與頁面大標題 (<h1>)
        const reportTitleStr = `比對報告 ${modelId} ${displayTime}`;
        const titleTag = clone.querySelector('title');
        if (titleTag) titleTag.textContent = reportTitleStr;
        const h1Tag = clone.querySelector('h1');
        if (h1Tag) h1Tag.textContent = reportTitleStr;

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
                <div style="flex: 1; text-align: right;"><strong>[資料庫資料]</strong> ${folderName}</div>
            `;
            
            topLayout.parentNode.replaceChild(summaryBar, topLayout);
        }

        // 移除不必要的互動按鈕與元素 (包含 a 連結)
        const elementsToRemove = clone.querySelectorAll(
            'button, script, a'
        );
        elementsToRemove.forEach(el => el.remove());

        // 移除標題的「3. 」前綴 (因為前面兩大區塊已經被摘要列取代，留著 3 會很怪)
        clone.querySelectorAll('h2').forEach(h2 => {
            if (h2.textContent.startsWith('3. ')) {
                h2.textContent = h2.textContent.replace('3. ', '');
            }
        });

        // 優化 SQL 輸出區塊在靜態報告中的呈現，並加入輕量離線語法高亮
        const sqlOutput = clone.querySelector('#sqlOutput');
        if (sqlOutput && sqlOutput.textContent.trim().length > 0) {
            let rawSql = sqlOutput.textContent;
            
            // 1. 跳脫 HTML 以防破版
            let htmlSql = rawSql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            // 使用占位符避免 Regex 規則互相干擾 (解決 HTML 屬性雙引號被誤判的問題)
            let tIdx = 0;
            const tokens = {};
            const wrap = (text, color, bold) => {
                const tk = `___TK${tIdx++}___`;
                tokens[tk] = `<span style="color: ${color};${bold ? ' font-weight: bold;' : ''}">${text}</span>`;
                return tk;
            };
            
            // 2. 依序提取並暫存 (註解最先處理，避免內部引號干擾)
            htmlSql = htmlSql.replace(/(--.*)/g, m => wrap(m, '#27ae60', false));
            htmlSql = htmlSql.replace(/'([^'\\]*)'/g, m => wrap(m, '#e67e22', false));
            htmlSql = htmlSql.replace(/"([^"\\]*)"/g, m => wrap(m, '#9b59b6', false));
            htmlSql = htmlSql.replace(/\b(INSERT INTO|VALUES|NULL)\b/gi, m => wrap(m, '#2980b9', true));

            // 3. 還原所有占位符為帶有樣式的 HTML
            for (const tk in tokens) {
                htmlSql = htmlSql.replace(tk, tokens[tk]);
            }

            const pre = document.createElement('pre');
            pre.innerHTML = htmlSql; // 改用 innerHTML 來顯示高亮顏色
            pre.style.background = '#f8f9fa';
            pre.style.padding = '15px';
            pre.style.border = '1px solid #ddd';
            pre.style.borderRadius = '4px';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.fontFamily = 'monospace';
            pre.style.lineHeight = '1.5';
            
            if (sqlOutput.parentNode) {
                const sqlHeader = document.createElement('h2');
                sqlHeader.textContent = '補齊缺漏資料 SQL';
                sqlOutput.parentNode.insertBefore(sqlHeader, sqlOutput);
                
                sqlOutput.parentNode.replaceChild(pre, sqlOutput);
            }
        } else if (sqlOutput) {
            // 如果沒有 SQL，就把整個 SQL 區塊隱藏，保持報告乾淨
            const sqlBlock = clone.querySelector('#sqlBlock');
            if (sqlBlock) sqlBlock.style.display = 'none';
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
