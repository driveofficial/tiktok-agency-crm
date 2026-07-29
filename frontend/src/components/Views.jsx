import React from 'react';
import { Icons } from './Icons';
import { Checkbox, SmartSelect, SwipeableRow } from './UI_Lib';
import {
    COLUMN_CONFIG, HIDDEN_COLUMNS, getColumnConfig, extractTiktokUsername,
    getDisplayName, getChecklistItems, getPipelineStage, getStageChipClasses,
    getStatusColor, todayISO
} from '../lib/columns';

const CRMTableBase = ({ headers, rows, loadingRows, onUpdateCell, onEditRow, onDeleteRow, onOpenInfo, selectMode, isRowSelected, onToggleSelect, onToggleSelectAll, allVisibleSelected }) => {
    const safeHeaders = headers || [];
    const hiddenCols = HIDDEN_COLUMNS || [];
    const isHidden = (h) => { if (!h) return true; return hiddenCols.includes(String(h).trim()); };
    // คอลัมน์สุดท้ายที่โชว์ (ติดกับคอลัมน์ Manage ที่ sticky) — ไม่ใส่ title tooltip
    // เพราะ browser วางกล่อง tooltip ใกล้ขอบจอแล้วมันไปทับไอคอน Manage
    const lastVisibleIdx = safeHeaders.reduce((last, h, i) => (!isHidden(h) ? i : last), -1);

    return (
        <div className="flex-1 overflow-auto bg-white custom-scrollbar relative">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
                <thead className="text-[11px] text-slate-500 font-bold uppercase tracking-wider sticky top-0 z-40 bg-white/95 backdrop-blur-sm shadow-sm">
                    <tr>
                        {selectMode && (
                            <th className="px-4 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm w-10">
                                <Checkbox checked={allVisibleSelected} onChange={onToggleSelectAll} size={18} />
                            </th>
                        )}
                        {safeHeaders.map((h, i) => {
                            if (isHidden(h)) return null;
                            return <th key={i} className="px-6 py-4 whitespace-nowrap border-b border-slate-100 bg-white/95 backdrop-blur-sm">{h}</th>;
                        })}
                        <th className="px-6 py-4 text-right sticky right-0 bg-white border-b border-slate-100 z-50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Manage</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? <tr><td colSpan={safeHeaders.length + 1 + (selectMode ? 1 : 0)} className="py-16">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300"><Icons.Search size={24} /></div>
                            <div>
                                <p className="text-slate-600 font-bold text-sm">ไม่พบข้อมูล</p>
                                <p className="text-slate-400 font-medium text-xs mt-0.5">ลองปรับตัวกรองหรือคำค้นหาดูอีกครั้ง</p>
                            </div>
                        </div>
                    </td></tr> : rows.map((r, i) => (
                        <tr key={i} className={`hover:bg-slate-50/80 group transition-colors ${selectMode && isRowSelected(i) ? 'bg-[#215E61]/10 hover:bg-[#215E61]/14' : ''}`}>
                            {selectMode && (
                                <td className="px-4 py-3 align-middle border-b border-slate-100">
                                    <Checkbox checked={isRowSelected(i)} onChange={() => onToggleSelect(i)} size={18} />
                                </td>
                            )}
                            {r.map((c, j) => {
                                const h = safeHeaders[j];
                                if (!h || isHidden(h)) return null;
                                const hl = String(h).toLowerCase();
                                const cfg = getColumnConfig(h)?.config;
                                const isLink = String(c || "").startsWith('http');
                                const isTiktokCol = hl.indexOf('tiktok') > -1 || hl.indexOf('ลิงค์') > -1 || hl.indexOf('ลิงก์') > -1;
                                const isNickCol = hl.indexOf('ชื่อเล่น') > -1 && !isTiktokCol;

                                let cell;
                                if (cfg?.type === 'select') {
                                    cell = <SmartSelect value={c} options={cfg.options} headerName={h} onChange={v => onUpdateCell(i, j, v)} isLoading={loadingRows.has(`${i}-${j}`)} />;
                                } else if (isTiktokCol) {
                                    const uname = extractTiktokUsername(c);
                                    if (isLink) {
                                        cell = <a href={c} target="_blank" className="inline-flex items-center gap-1 text-[#215E61] font-bold text-xs hover:underline bg-[#215E61]/10 px-2.5 py-1 rounded-lg transition-colors">{uname ? <Icons.Video size={10} /> : <Icons.ExternalLink size={10} />} {uname || 'Open'}</a>;
                                    } else {
                                        cell = <span className="text-slate-700 font-medium">{uname || c || '-'}</span>;
                                    }
                                } else if (isNickCol && (!c || String(c).trim() === '')) {
                                    const dn = getDisplayName(safeHeaders, r);
                                    cell = <span className="text-slate-400 italic font-medium">{dn || '-'}</span>;
                                } else if (isLink) {
                                    cell = <a href={c} target="_blank" className="inline-flex items-center gap-1 text-[#215E61] font-bold text-xs hover:underline bg-[#215E61]/10 px-2.5 py-1 rounded-lg transition-colors"><Icons.ExternalLink size={10} /> Open</a>;
                                } else {
                                    cell = <span className="text-slate-700 font-medium">{c}</span>;
                                }
                                return (
                                    <td key={j} title={cfg?.type !== 'select' && !isLink && j !== lastVisibleIdx ? String(c ?? '') : undefined} className="px-6 py-3 whitespace-nowrap max-w-[200px] truncate align-middle border-b border-slate-100">
                                        {cell}
                                    </td>
                                );
                            })}
                            <td className="px-6 py-3 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors z-30 align-middle border-b border-slate-100 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                                <div className="flex justify-end items-center gap-1">
                                    {(() => {
                                        const items = getChecklistItems(safeHeaders, r);
                                        if (items.length === 0) return null;
                                        const done = items.filter(x => x.done).length;
                                        const complete = done === items.length;
                                        return (
                                            <span title="ความคืบหน้าเช็คลิสต์" className={`text-[10px] font-bold px-2 py-1 rounded-lg border mr-1 ${complete ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                {done}/{items.length}
                                            </span>
                                        );
                                    })()}
                                    <button onClick={() => onOpenInfo(i)} className="w-8 h-8 inline-flex items-center justify-center text-[#215E61] hover:text-[#215E61] hover:bg-[#215E61]/10 rounded-lg transition-all" title="ดูรายละเอียด" aria-label="ดูรายละเอียด"><Icons.User size={16} /></button>
                                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                    <button onClick={() => onEditRow(i)} title="แก้ไข" aria-label="แก้ไข" className="p-1.5 hover:bg-[#215E61]/10 text-slate-400 hover:text-[#215E61] rounded-lg transition-colors"><Icons.Edit size={16} /></button>
                                    <button onClick={() => onDeleteRow(i)} title="ลบ" aria-label="ลบ" className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"><Icons.Trash2 size={16} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const MobileCardBase = ({ row, headers, rowIndex, loadingRows, onUpdateCell, onEdit, onDelete, onOpenInfo, selectMode, selected, onToggleSelect, enableSwipe = true, expanded = false, onToggleExpand }) => {
    const showFull = expanded && !selectMode;
    const get = (k) => {
        if (!headers) return null;
        const kl = String(k).toLowerCase();
        const i = headers.findIndex(h => h && String(h).toLowerCase().includes(kl));
        return i === -1 ? null : { v: row[i], i };
    };
    const [copied, setCopied] = React.useState(false);

    const n = getDisplayName(headers, row);
    const d = get("วันที่")?.v;
    const seq = get("ลำดับ")?.v;

    const followers = get("ผู้ติดตาม")?.v || "-";
    const views = get("วิว")?.v || "-";
    const style = get("สไตล์")?.v || "-";
    const comm = get("Commission")?.v || "-";

    const s = get("สถานะ");
    const l = get("ลิงค์")?.v;
    const isL = l && String(l).startsWith('http');
    const stage = getPipelineStage(headers, row);
    const stageClasses = getStageChipClasses(stage);

    const checklistItems = getChecklistItems(headers, row);
    const checklistDone = checklistItems.filter(x => x.done).length;
    const checklistComplete = checklistItems.length > 0 && checklistDone === checklistItems.length;
    const seqStr = seq == null ? "#" : String(seq);
    const seqTextSize = seqStr.length >= 4 ? 'text-sm' : seqStr.length === 3 ? 'text-base' : 'text-lg';

    const cardBody = (
        <div
            onClick={selectMode ? onToggleSelect : undefined}
            className={`bg-white rounded-[24px] p-5 sm:p-6 shadow-sm border space-y-5 animate-enter relative transition-shadow ${selectMode ? 'cursor-pointer ' + (selected ? 'border-[#215E61]/40 ring-2 ring-[#215E61]/18 bg-[#215E61]/8' : 'border-slate-100 hover:border-slate-200') : 'border-slate-100 hover:shadow-md'}`}
        >
            <div className="flex justify-between items-start gap-2">
                <div className="flex gap-3 items-center min-w-0 flex-1">
                    {selectMode ? (
                        <Checkbox checked={!!selected} onChange={onToggleSelect} size={30} />
                    ) : (
                        <div className={`w-12 h-12 rounded-2xl bg-[#215E61]/10 flex items-center justify-center font-extrabold text-[#215E61] ${seqTextSize} border border-[#215E61]/18 shrink-0 shadow-sm`}>{seqStr}</div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h3 className="font-extrabold text-slate-800 truncate text-xl leading-tight">{n}</h3>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {stage && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${stageClasses}`}>{stage.label}</span>}
                            {checklistItems.length > 0 && (
                                <span title="ความคืบหน้าเช็คลิสต์" className={`text-[11px] font-extrabold px-2 py-1 rounded-full border whitespace-nowrap ${checklistComplete ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                    {checklistDone}/{checklistItems.length}
                                </span>
                            )}
                            {d && <span className="text-xs text-slate-400 flex items-center gap-1 font-medium whitespace-nowrap"><Icons.Calendar size={12} /> {d}</span>}
                        </div>
                    </div>
                </div>
                {!selectMode && (
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-9 h-9 inline-flex items-center justify-center text-slate-400 hover:text-[#215E61] hover:bg-[#215E61]/10 rounded-lg transition-colors" title="แก้ไข" aria-label="แก้ไข"><Icons.Edit size={17} /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-9 h-9 inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบ" aria-label="ลบ"><Icons.Trash2 size={17} /></button>
                    </div>
                )}
            </div>

            {showFull && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[{ k: 'Followers', v: followers }, { k: 'Views', v: views }, { k: 'Style', v: style }, { k: 'Comm.', v: comm }].map((m, i) => (
                        <div key={i} className="bg-slate-50/70 rounded-2xl px-3.5 py-3 border border-slate-100">
                            <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">{m.k}</div>
                            <div className="text-base font-extrabold text-slate-800 truncate">{m.v}</div>
                        </div>
                    ))}
                </div>
            )}

            {(() => {
                const items = checklistItems;
                if (items.length === 0) return null;
                const shortLabel = { 'ปิดดีล / รับข้อเสนอ': 'ปิดดีล' };
                return (
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Icons.CheckSquare size={13} /> เช็คลิสต์
                            {!selectMode && <span className="normal-case tracking-normal text-slate-300 font-medium">· แตะเพื่อติ๊ก</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {items.map((item, idx) => {
                                const label = shortLabel[item.label] || item.label;
                                const loading = loadingRows.has(`${rowIndex}-${item.idx}`);
                                const canToggle = item.toggleable && !selectMode && !!onUpdateCell;
                                const cls = `text-[11px] font-bold px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${item.done ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'} ${canToggle ? 'cursor-pointer ' + (item.done ? 'hover:bg-emerald-100' : 'hover:bg-slate-100') : ''}`;
                                const inner = (<>{loading ? <Icons.Loader2 size={11} className="animate-spin" /> : item.done ? <Icons.Check size={11} strokeWidth={3} /> : <Icons.Circle size={10} />}{label}</>);
                                return canToggle ? (
                                    <button key={idx} type="button" disabled={loading} aria-pressed={item.done}
                                        aria-label={`${label}: ${item.done ? 'ทำแล้ว แตะเพื่อยกเลิก' : 'ยังไม่ทำ แตะเพื่อทำเครื่องหมาย'}`}
                                        onClick={(e) => { e.stopPropagation(); onUpdateCell(rowIndex, item.idx, item.done ? item.undoneValue : item.doneValue); }}
                                        className={cls + ' active:scale-95 disabled:opacity-60'}>{inner}</button>
                                ) : (<span key={idx} className={cls}>{inner}</span>);
                            })}
                        </div>
                    </div>
                );
            })()}

            <div className={selectMode ? 'pointer-events-none opacity-50 space-y-5' : 'space-y-5'}>
                {s && (
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5"><Icons.Target size={13} /> สถานะ</div>
                        <SmartSelect value={s.v} options={COLUMN_CONFIG["สถานะ"].options} headerName="สถานะ" onChange={v => onUpdateCell(rowIndex, s.i, v)} isLoading={loadingRows.has(`${rowIndex}-${s.i}`)} />
                    </div>
                )}

                {showFull && (<>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5"><Icons.User size={13} /> การติดต่อ</div>
                        {(() => {
                            const contact = get("ช่องทางติดต่อ");
                            const raw = contact ? String(contact.v || '').trim() : '';
                            if (!raw || raw === '-') return null;
                            const channel = String(get("ติดต่อกัน")?.v || '').trim();
                            const platform = channel.toLowerCase();
                            const isUrl = /^https?:\/\//i.test(raw);
                            const isPhone = /^[0-9+][0-9\-\s]{5,}$/.test(raw);
                            const chan = platform.includes('line') ? { label: 'Line', cls: 'bg-[#06c755]/10 text-[#06c755] border-[#06c755]/25', Icon: Icons.MessageCircle }
                                : platform.includes('facebook') ? { label: 'Facebook', cls: 'bg-[#1877f2]/10 text-[#1877f2] border-[#1877f2]/25', Icon: Icons.Facebook }
                                : (platform.includes('insta') || platform.includes('ig')) ? { label: 'Instagram', cls: 'bg-[#e1306c]/10 text-[#e1306c] border-[#e1306c]/25', Icon: Icons.Instagram }
                                : platform.includes('tiktok') ? { label: 'TikTok', cls: 'bg-slate-900/5 text-slate-800 border-slate-900/15', Icon: Icons.Video }
                                : (platform.includes('โทร') || isPhone) ? { label: 'โทร', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', Icon: Icons.Phone }
                                : { label: platform || 'ติดต่อ', cls: 'bg-slate-100 text-slate-600 border-slate-200', Icon: Icons.User };
                            const commonCls = `group w-full flex items-center gap-3 px-3 py-2.5 mb-2.5 rounded-2xl border transition-all ${chan.cls}`;
                            const inner = (<>
                                <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-white/60"><chan.Icon size={16} /></span>
                                <span className="flex flex-col min-w-0 flex-1 text-left leading-tight">
                                    <span className="text-[10px] uppercase font-bold tracking-wide opacity-60">{channel || chan.label}</span>
                                    <span className="text-sm font-bold truncate">{raw}</span>
                                </span>
                                <span className="shrink-0 opacity-60">{isUrl ? <Icons.ExternalLink size={16} /> : isPhone ? <Icons.Phone size={16} /> : (copied ? <Icons.Check size={16} strokeWidth={3} /> : <Icons.Copy size={16} />)}</span>
                            </>);
                            if (isUrl) return <a href={raw} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={commonCls + ' hover:brightness-95'}>{inner}</a>;
                            if (isPhone) return <a href={`tel:${raw.replace(/[\s-]/g, '')}`} onClick={e => e.stopPropagation()} className={commonCls + ' hover:brightness-95'}>{inner}</a>;
                            return (
                                <button type="button" aria-label={`คัดลอกช่องทางติดต่อ ${raw}`}
                                    onClick={(e) => { e.stopPropagation(); const t = raw; if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); } }}
                                    className={commonCls + ' hover:brightness-95 active:scale-[0.99]'}>{inner}</button>
                            );
                        })()}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {['ทัก/ยังไม่ทัก', 'คอมเมนท์', 'ตามแชท'].map(k => {
                                const x = get(k);
                                return x ? (
                                    <div key={k} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between h-full gap-2">
                                        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wide truncate">{k.split('/')[0]}</div>
                                        <SmartSelect value={x.v} options={getColumnConfig(k)?.config?.options} headerName={k} onChange={v => onUpdateCell(rowIndex, x.i, v)} isLoading={loadingRows.has(`${rowIndex}-${x.i}`)} compact />
                                    </div>
                                ) : null;
                            })}
                        </div>
                    </div>

                    {(get('ส่งของถึงยัง') || get('ลงคลิปยัง') || get('ได้รับของ')) && (
                        <div className="border-t border-slate-100 pt-4 space-y-2.5">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Icons.Package size={13} /> ติดตามการจัดส่ง & คลิป</div>
                            <div className="grid grid-cols-2 gap-2.5">
                                {[{ k: 'ส่งของถึงยัง', label: 'ส่งของ' }, { k: 'ลงคลิปยัง', label: 'ลงคลิป' }].map(({ k, label }) => {
                                    const x = get(k);
                                    return x ? (
                                        <div key={k} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between h-full gap-2">
                                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wide truncate">{label}</div>
                                            <SmartSelect value={x.v} options={getColumnConfig(k)?.config?.options} headerName={k} onChange={v => onUpdateCell(rowIndex, x.i, v)} isLoading={loadingRows.has(`${rowIndex}-${x.i}`)} compact />
                                        </div>
                                    ) : null;
                                })}
                            </div>
                            {(() => {
                                const rr = get('ได้รับของ');
                                if (!rr) return null;
                                const raw = String(rr.v || '').trim();
                                const hasDate = raw !== '' && raw !== '-';
                                let inputVal = '';
                                if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) inputVal = raw;
                                else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
                                    const p = raw.split('/');
                                    inputVal = `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
                                }
                                const isCellLoading = loadingRows.has(`${rowIndex}-${rr.i}`);
                                return (
                                    <div className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 ${hasDate ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                        <span className={`text-[11px] font-bold uppercase flex items-center gap-1.5 shrink-0 ${hasDate ? 'text-emerald-600' : 'text-slate-400'}`}><Icons.Calendar size={13} /> ได้รับของวันไหน</span>
                                        {isCellLoading ? (<Icons.Loader2 size={16} className="animate-spin text-slate-400" />) : (
                                            <input type="date" value={inputVal} onChange={e => onUpdateCell(rowIndex, rr.i, e.target.value)} onClick={e => e.stopPropagation()} className={`text-sm font-bold bg-transparent outline-none text-right cursor-pointer min-w-0 ${hasDate ? 'text-emerald-700' : 'text-slate-400'}`} />
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    <div className="flex gap-2.5 pt-1">
                        <button onClick={onOpenInfo} className="flex-1 py-3.5 rounded-2xl bg-[#215E61]/10 text-[#215E61] text-sm font-bold hover:bg-[#215E61]/18 transition-colors flex items-center justify-center gap-2 border border-[#215E61]/18"><Icons.User size={16} /> ข้อมูลเพิ่มเติม</button>
                        {isL && (<a href={l} target="_blank" className="flex-1 py-3.5 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"><Icons.ExternalLink size={16} /> TikTok</a>)}
                    </div>
                </>)}
            </div>

            {!selectMode && onToggleExpand && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} aria-expanded={showFull} className="w-full flex items-center justify-center gap-1.5 pt-1 text-xs font-bold text-slate-400 hover:text-[#215E61] transition-colors">
                    {showFull ? <>ย่อ <Icons.ChevronUp size={15} /></> : <>ดูเพิ่มเติม <Icons.ChevronDown size={15} /></>}
                </button>
            )}
        </div>
    );

    if (selectMode || !enableSwipe) return cardBody;

    return (
        <SwipeableRow onEdit={onEdit} onDelete={onDelete} disabled={selectMode}>
            {cardBody}
        </SwipeableRow>
    );
};

// ============================================================================
// CreatorCard — การ์ดครีเอเตอร์ดีไซน์ใหม่ (creator-grid). แทน MobileCard ใน card view
// ดึงข้อมูลจาก headers/row (dynamic column) เหมือน MobileCard. shipping tracker
// ปรับใช้คอลัมน์จริง: "ส่งของถึงยัง" (ยังไม่ส่ง/ส่งแล้ว) + "ได้รับของวันไหน" (date)
// ============================================================================
const CONTACT_MAP = {
    line: { label: 'Line', Icon: Icons.MessageCircle, color: 'text-[#06c755]' },
    facebook: { label: 'Facebook', Icon: Icons.Facebook, color: 'text-[#1877f2]' },
    instagram: { label: 'Instagram', Icon: Icons.Instagram, color: 'text-[#e1306c]' },
    ig: { label: 'Instagram', Icon: Icons.Instagram, color: 'text-[#e1306c]' },
    tiktok: { label: 'TikTok', Icon: Icons.Music, color: 'text-slate-800' },
    email: { label: 'Email', Icon: Icons.User, color: 'text-blue-600' },
    'โทร': { label: 'โทร', Icon: Icons.Phone, color: 'text-cyan-600' },
};
const contactMeta = (raw) => {
    const s = String(raw || '').toLowerCase();
    for (const k of Object.keys(CONTACT_MAP)) if (s.includes(k)) return CONTACT_MAP[k];
    return { label: raw || 'ติดต่อ', Icon: Icons.User, color: 'text-slate-500' };
};

const CreatorCardBase = ({ row, headers, rowIndex, loadingRows, onUpdateCell, onEdit, onDelete, onOpenInfo, selectMode, selected, onToggleSelect }) => {
    const get = (k) => {
        if (!headers) return null;
        const kl = String(k).toLowerCase();
        const i = headers.findIndex(h => h && String(h).toLowerCase().includes(kl));
        return i === -1 ? null : { v: row[i], i };
    };

    const name = getDisplayName(headers, row);
    const link = get('ลิงค์')?.v ?? get('tiktok')?.v;
    const handle = extractTiktokUsername(link);
    const isLink = link && String(link).startsWith('http');
    const date = get('วันที่')?.v;
    const followers = get('ผู้ติดตาม')?.v || '-';
    const views = String(get('วิว')?.v || '-').replace('หลัก', '');
    const style = get('สไตล์')?.v || '';
    const comm = get('Commission')?.v || '-';
    const status = get('สถานะ');
    const statusLabel = String(status?.v || '').trim() || 'ยังไม่ระบุ';
    // โชว์ช่องส่งของเฉพาะเมื่อ "รับข้อเสนอ" (ดีลจบ) — ยังไม่รับก็ยังไม่ต้องส่ง
    const accepted = /รับข้อเสนอ|ดีลจบ/.test(statusLabel) && !statusLabel.includes('ไม่รับ');
    const contactRaw = String(get('ติดต่อกัน')?.v || '').trim();
    const cm = contactMeta(contactRaw);
    const contactId = String(get('ช่องทางติดต่อ')?.v || '').trim();

    // คัดลอกไอดี (tiktok/line/ig) + feedback
    const [copied, setCopied] = React.useState(null);
    const copyText = (text, key) => {
        if (!text || !navigator.clipboard?.writeText) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(c => (c === key ? null : c)), 1400);
        }).catch(() => {});
    };

    // ---- shipping tracker (คอลัมน์จริง) ----
    const shipCell = get('ส่งของถึงยัง');
    const recvCell = get('ได้รับของ');
    const shipped = String(shipCell?.v || '').includes('ส่งแล้ว');
    const recvRaw = String(recvCell?.v || '').trim();
    const received = recvRaw !== '' && recvRaw !== '-';
    // เช็ค "ได้รับของ" ก่อน "ส่งของ" — กันเคสข้อมูลนำเข้าที่มีวันที่รับของแล้วแต่ลืมติ๊กส่งของ
    const shipState = received ? 'received' : shipped ? 'waiting' : 'none';
    const cellLoading = (cell) => cell && loadingRows.has(`${rowIndex}-${cell.i}`);

    const shipBtn = () => {
        if (shipState === 'none' && shipCell) return (
            <button type="button" onClick={(e) => { e.stopPropagation(); onUpdateCell(rowIndex, shipCell.i, 'ส่งแล้ว'); }} disabled={cellLoading(shipCell)}
                className="mt-2 w-full h-8 rounded-lg bg-[#215E61] hover:bg-[#1a4a4d] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors active:scale-95 disabled:opacity-60">
                {cellLoading(shipCell) ? <Icons.Loader2 size={13} className="animate-spin" /> : <Icons.Truck size={13} />} ส่งของเลย</button>);
        if (shipState === 'waiting' && recvCell) return (
            <button type="button" onClick={(e) => { e.stopPropagation(); onUpdateCell(rowIndex, recvCell.i, todayISO()); }} disabled={cellLoading(recvCell)}
                className="mt-2 w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors active:scale-95 disabled:opacity-60">
                {cellLoading(recvCell) ? <Icons.Loader2 size={13} className="animate-spin" /> : <Icons.PackageCheck size={13} />} ได้รับแล้ว</button>);
        return null;
    };

    // กะทัด: ทุก state = แถวเดียว (icon + ข้อความ) + ปุ่ม — สูงเท่ากัน ไม่ขยายตอนกดส่ง
    const shipBlock = () => {
        if (!accepted) return null;
        if (!shipCell && !recvCell) return null;
        let icon, text, textCls, borderCls;
        if (shipState === 'received') { icon = <Icons.PackageCheck size={14} />; text = 'ได้รับแล้ว'; textCls = 'text-emerald-600'; borderCls = 'border-emerald-200 bg-emerald-50/40'; }
        else if (shipState === 'waiting') { icon = <Icons.Truck size={14} />; text = 'กำลังส่ง'; textCls = 'text-amber-600'; borderCls = 'border-amber-200 bg-amber-50/40'; }
        else { icon = <Icons.Package size={14} />; text = 'ส่งของเลย'; textCls = 'text-slate-400'; borderCls = 'border-slate-200'; }
        return (
            <div className={`rounded-xl border p-2 ${borderCls}`}>
                <div className={`flex items-center gap-1.5 ${textCls}`}>{icon}<span className="text-[11px] font-semibold truncate">{text}</span></div>
                {shipBtn()}
            </div>);
    };

    return (
        <div onClick={selectMode ? onToggleSelect : undefined}
            className={`creator-card h-full bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all duration-200 ${selectMode ? 'cursor-pointer ' + (selected ? 'border-[#215E61] ring-2 ring-[#FF9E20]' : 'border-[#1d21281f] hover:border-slate-300') : 'border-[#1d21281f] hover:-translate-y-[3px] hover:shadow-[0_12px_28px_-12px_rgba(29,33,40,0.22)] hover:border-[#215E61]/40'}`}>
            <div className="p-2.5 flex flex-col gap-2 flex-1">
                {/* header: ชื่อ + select */}
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-sm text-slate-900 truncate leading-tight">{name}</div>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                        className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-[#215E61] border-[#215E61] text-white' : 'border-slate-300 hover:border-[#215E61] text-transparent'}`}>
                        <Icons.Check size={12} strokeWidth={3} /></button>
                </div>

                {/* chips */}
                <div className="flex flex-wrap gap-1">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${getStatusColor(statusLabel, 'สถานะ')}`}>{statusLabel}</span>
                    {style && <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${getStatusColor(style, 'สไตล์')}`}>{style}</span>}
                </div>

                {/* meta — บรรทัดแรก: วันที่ + TikTok ID (ไม่มีไอคอน) / บรรทัดสอง: ช่องทางติดต่อ (Line ฯลฯ) แยกบรรทัด */}
                <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                        {date && <span className="flex items-center gap-1 shrink-0"><Icons.Calendar size={12} /> {date}</span>}
                        {handle && (
                            isLink ? (
                                <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="เปิด TikTok"
                                    className="text-[11px] font-semibold text-slate-600 hover:text-[#215E61] hover:underline transition-colors truncate min-w-0">
                                    TikTok: {handle}
                                </a>
                            ) : (
                                <button type="button" onClick={(e) => { e.stopPropagation(); copyText(handle, 'handle'); }} title="คัดลอก TikTok ID" aria-label="คัดลอก TikTok ID"
                                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#215E61] transition-colors min-w-0">
                                    <span className="truncate">TikTok: {handle}</span>
                                    {copied === 'handle' ? <Icons.Check size={10} strokeWidth={3} className="text-emerald-500 shrink-0" /> : <Icons.Copy size={10} className="opacity-50 shrink-0" />}
                                </button>
                            )
                        )}
                    </div>
                    {contactRaw && !contactRaw.toLowerCase().includes('tiktok') ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            {contactId && contactId !== '-' ? (
                                // ลิงก์ย่อไลน์ (lin.ee/line.me) — ใช้ค่าดิบจากชีตตรงๆ ไม่ปรับแต่ง แค่เติม https:// ให้เปิดได้
                                // ไม่ไฮไลท์สีตาม platform — chip เป็นกลาง (สีเทา) เหมือนกันทุกอัน
                                /^(https?:\/\/)?(lin\.ee|line\.me)\//i.test(contactId) ? (
                                    <a href={/^https?:\/\//i.test(contactId) ? contactId : `https://${contactId}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="เปิดลิงก์ไลน์"
                                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#215E61] hover:underline transition-colors min-w-0">
                                        <cm.Icon size={12} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{contactRaw}: {contactId}</span>
                                        <Icons.ExternalLink size={10} className="opacity-50 shrink-0" />
                                    </a>
                                ) : (
                                    <button type="button" onClick={(e) => {
                                        e.stopPropagation();
                                        // instagram: ไอดีที่พิมพ์เผื่อมีคำว่า ig/instagram นำหน้าติดมาด้วย — ตัดออกก่อนคัดลอก ไม่งั้นซ้ำกับไอคอน/ป้ายที่บอกอยู่แล้ว
                                        const isInstagram = contactRaw.toLowerCase().includes('instagram') || contactRaw.toLowerCase() === 'ig';
                                        const toCopy = isInstagram ? contactId.replace(/^\s*(ig|instagram)\s*[:\-]?\s*@?/i, '') : contactId;
                                        copyText(toCopy, 'contact');
                                    }} title="คัดลอกไอดีติดต่อ" aria-label="คัดลอกไอดีติดต่อ"
                                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#215E61] transition-colors min-w-0">
                                        <cm.Icon size={12} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{contactRaw}: {contactId}</span>
                                        {copied === 'contact' ? <Icons.Check size={10} strokeWidth={3} className="text-emerald-500 shrink-0" /> : <Icons.Copy size={10} className="opacity-50 shrink-0" />}
                                    </button>
                                )
                            ) : (
                                <span className="flex items-center gap-1 text-slate-500"><cm.Icon size={12} className="text-slate-400" /> {contactRaw}</span>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-slate-400 italic">ไม่มีช่องทางติดต่อ</div>
                    )}
                </div>

                {/* 3-stat */}
                <div className="grid grid-cols-3 rounded-lg bg-[#EDEBEB] divide-x divide-[#1d21281f] overflow-hidden">
                    <div className="px-1.5 py-1.5 text-center">
                        <div className="text-[13px] font-extrabold text-slate-900 leading-none truncate">{followers}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">ผู้ติดตาม</div>
                    </div>
                    <div className="px-1.5 py-1.5 text-center">
                        <div className="text-[13px] font-extrabold text-slate-900 leading-none truncate">{views}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">ระดับวิว</div>
                    </div>
                    <div className="px-1.5 py-1.5 text-center">
                        <div className={`text-[13px] font-extrabold leading-none truncate ${comm === '-' ? 'text-slate-400' : 'text-[#215E61]'}`}>{comm}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Commission</div>
                    </div>
                </div>

                {/* shipping tracker — reserve slot สูงเท่ากันทุกใบ; ยังไม่รับข้อเสนอ = โชว์ "รอดำเนินการ" */}
                <div className="min-h-[72px] flex flex-col justify-start">
                    {accepted ? shipBlock() : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-2 flex items-center gap-1.5 text-slate-400">
                            <Icons.Clock size={14} /><span className="text-[11px] font-semibold">รอดำเนินการ</span>
                        </div>
                    )}
                </div>
            </div>

            {/* footer */}
            <div className="flex items-center gap-1.5 p-2 border-t border-slate-100 bg-slate-50/50">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpenInfo(); }} className="flex-1 h-9 rounded-lg bg-[#215E61] hover:bg-[#1a4a4d] text-white text-xs font-bold transition-colors">ดูข้อมูล</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="แก้ไข" aria-label="แก้ไข" className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[#215E61] hover:border-[#215E61] transition-colors flex items-center justify-center"><Icons.Edit size={15} /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="ลบ" aria-label="ลบ" className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-300 transition-colors flex items-center justify-center"><Icons.Trash2 size={15} /></button>
            </div>
        </div>
    );
};

export const CRMTable = React.memo(CRMTableBase);
export const MobileCard = React.memo(MobileCardBase);
export const CreatorCard = React.memo(CreatorCardBase);
