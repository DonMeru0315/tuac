import { db, firestore } from './firebase-init.js';

export async function handleExport(type, period) {
    // period が 'YYYY-MM' (月次) か 'YYYY' (年次) かを判定
    const isYearly = !period.includes('-');
    let firstDay, lastDay, dateStartStr, dateEndStr;

    if (isYearly) {
        const yearNum = parseInt(period, 10);
        firstDay = new Date(yearNum, 0, 1); // その年の1月1日
        lastDay = new Date(yearNum, 11, 31, 23, 59, 59); // その年の12月31日
        dateStartStr = `${period}-01-01`;
        dateEndStr = `${period}-12-31`;
    } else {
        const [year, monthStr] = period.split('-');
        const yearNum = parseInt(year, 10);
        const monthNum = parseInt(monthStr, 10) - 1;
        firstDay = new Date(yearNum, monthNum, 1);
        lastDay = new Date(yearNum, monthNum + 1, 0, 23, 59, 59);
        dateStartStr = `${period}-01`;
        dateEndStr = `${period}-31`; 
    }

    if (type.startsWith('calendar')) {
        // カレンダー（イベント）データの抽出
        const snapshot = await db.collection('events')
            .where('date', '>=', firestore.Timestamp.fromDate(firstDay))
            .where('date', '<=', firestore.Timestamp.fromDate(lastDay))
            .get();
        
        const events = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            events.push({
                date: data.date.toDate().toLocaleDateString('ja-JP'),
                title: data.title,
                location: data.location || '未設定'
            });
        });
        events.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (type.endsWith('csv')) { exportCalendarCSV(events, period); } 
        else { await exportCalendarPDF(events, period); }

    } else {
        // 整備履歴データの抽出
        const vehicleSnapshot = await db.collection('vehicles').get();
        const logs = [];

        for (const vehicleDoc of vehicleSnapshot.docs) {
            const vehicleData = vehicleDoc.data();
            const logSnapshot = await vehicleDoc.ref.collection('maintenance_logs')
                .where('date', '>=', dateStartStr)
                .where('date', '<=', dateEndStr)
                .get();
            
            logSnapshot.forEach(doc => {
                const data = doc.data();
                logs.push({
                    vehicleName: vehicleData.name,
                    date: data.date,
                    task: data.task,
                    notes: data.notes || ''
                });
            });
        }
        logs.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (type.endsWith('csv')) { exportLogsCSV(logs, period); } 
        else { await exportLogsPDF(logs, period); }
    }
}

// レポートの表示用タイトルを綺麗に整形（'2026-05' -> '2026年05月', '2026' -> '2026年'）
function formatTitle(period) {
    if (period.includes('-')) {
        const [y, m] = period.split('-');
        return `${y}年${m}月`;
    }
    return `${period}年`;
}

// 出力ユーティリティ
function downloadCSV(csvContent, filename) {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportCalendarCSV(events, period) {
    let csv = "日付,日程名,場所\n";
    events.forEach(e => { csv += `"${e.date}","${e.title}","${e.location}"\n`; });
    downloadCSV(csv, `activity_report_${period}.csv`);
}

function exportLogsCSV(logs, period) {
    let csv = "日付,対象部車,作業内容,メモ\n";
    logs.forEach(l => { csv += `"${l.date}","${l.vehicleName}","${l.task}","${l.notes}"\n`; });
    downloadCSV(csv, `maintenance_report_${period}.csv`);
}

function openPrintWindow(title, htmlContent) {
    return new Promise((resolve) => {
        let printContainer = document.getElementById('print-area');
        if (!printContainer) {
            printContainer = document.createElement('div');
            printContainer.id = 'print-area';
            printContainer.className = 'print-only';
            document.body.appendChild(printContainer);
        }
        let printStyle = document.getElementById('print-style');
        if (!printStyle) {
            printStyle = document.createElement('style');
            printStyle.id = 'print-style';
            printStyle.textContent = `
                /* 通常時は印刷用領域を隠す */
                @media screen {
                    .print-only { display: none !important; }
                }
                @media print {
                    /* ★ visibility ではなく display: none を使い、iOSでのPDF生成を爆速化 */
                    body > *:not(#print-area):not(script):not(style) { display: none !important; }
                    #print-area { display: block !important; position: relative; width: 100%; padding: 0; background: white; margin: 0; }
                    #print-area h1 { font-size:1.5rem; border-bottom:2px solid #D66000; padding-bottom:8px; margin-bottom:20px; }
                    #print-area table { width:100%; border-collapse:collapse; margin-top:10px; }
                    #print-area th, #print-area td { border:1px solid #ddd; padding:10px; text-align:left; font-size:0.9rem; }
                    #print-area th { background-color:#f4f4f9; font-weight:bold; }
                }
            `;
            document.head.appendChild(printStyle);
        }
        printContainer.innerHTML = `
            <h1>${title}</h1>
            ${htmlContent}
        `;
        setTimeout(() => {
            window.print();
            setTimeout(resolve, 500);
        }, 150);
    });
}

async function exportCalendarPDF(events, period) {
    let html = '<table><thead><tr><th>日付</th><th>日程名</th><th>場所</th></tr></thead><tbody>';
    if(events.length === 0) html += '<tr><td colspan="3" style="text-align:center;">予定はありません</td></tr>';
    events.forEach(e => { html += `<tr><td>${e.date}</td><td><strong>${e.title}</strong></td><td>${e.location}</td></tr>`; });
    html += '</tbody></table>';
    await openPrintWindow(`自動車部 活動日程報告書 (${formatTitle(period)})`, html);
}

async function exportLogsPDF(logs, period) {
    let html = '<table><thead><tr><th>日付</th><th>対象部車</th><th>作業内容</th><th>メモ</th></tr></thead><tbody>';
    if(logs.length === 0) html += '<tr><td colspan="4" style="text-align:center;">整備履歴はありません</td></tr>';
    logs.forEach(l => { html += `<tr><td>${l.date}</td><td><span style="background:#eee;padding:2px 6px;border-radius:4px;font-size:0.8rem;">${l.vehicleName}</span></td><td><strong>${l.task}</strong></td><td>${l.notes}</td></tr>`; });
    html += '</tbody></table>';
    await openPrintWindow(`拓殖大学自動車部 整備実績報告書 (${formatTitle(period)})`, html);
}