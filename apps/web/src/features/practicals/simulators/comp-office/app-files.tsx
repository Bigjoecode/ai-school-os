import { coFsBin, coFsCopy, coFsDelete, coFsDir, coFsEject, coFsInsertFlash, coFsKids, coFsMkdir, coFsPaste, coFsPath, coFsRename, coFsRestore, coFsSize, type CoFs, type CoNode } from '@aischool/shared';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { Lbl, Modal, Note, Pri, Tb, Tools, inputCls } from './ui';

/** File Explorer: drives and folders, details view, cut/copy/paste, rename, Recycle Bin, a flash drive that must be ejected, Properties, and a small Command Prompt. */

const size = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);
const icon = (n: CoNode) => (n.kind === 'DRIVE' ? '💽' : n.kind === 'FOLDER' ? '📁' : '📄');

export function FilesApp({ o }: { o: Office }) {
  const fs = o.s.fs;
  const ro = o.readOnly;
  const set = (fn: (x: CoFs) => CoFs, log?: string) => o.set('fs', fn, log);
  const [dir, setDir] = useState<string>('d');
  const [sel, setSel] = useState<string[]>([]);
  const [bin, setBin] = useState(false);
  const [msg, setMsg] = useState<{ t: 'bad' | 'good'; x: string } | null>(null);
  const [dialog, setDialog] = useState<null | 'new' | 'rename' | 'props' | 'cmd'>(null);
  const [name, setName] = useState('');
  const [cmd, setCmd] = useState('');
  const [out, setOut] = useState('Command Prompt. Try: dir D:\\School');
  const drives = fs.nodes.filter((n) => n.parent === null && !(n.id === 'flash' && fs.flash !== 'IN'));
  const here = fs.nodes.find((n) => n.id === dir);
  const up = () => here?.parent && (setDir(here.parent), setSel([]));
  const list = bin ? coFsBin(fs) : coFsKids(fs, dir);
  const res = (r: { fs: CoFs; error: string | null }, log: string) => {
    if (r.error) setMsg({ t: 'bad', x: r.error });
    else (o.set('fs', () => r.fs, log), setMsg(null));
  };
  const open = (n: CoNode) => {
    if (n.kind !== 'FILE') (setDir(n.id), setSel([]), setBin(false));
  };
  const toggle = (id: string, multi: boolean) => setSel((x) => (multi ? (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]) : [id]));
  const one = sel.length === 1 ? fs.nodes.find((n) => n.id === sel[0]) : undefined;
  const run = () => {
    const c = cmd.trim();
    if (!c) return;
    const m = /^dir(?:\s+(.+))?$/i.exec(c);
    if (m) setOut(coFsDir(fs, m[1]?.trim() ?? coFsPath(fs, dir)));
    else if (/^cd\b/i.test(c)) setOut('Use dir with a full path here.');
    else setOut(`'${c.split(' ')[0]}' is not recognised as a command.`);
    set((x) => ({ ...x, cmds: [...x.cmds, c].slice(-18) }), 'fs:cmd');
    setCmd('');
  };
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
      {!ro && (
        <Tools>
          <Tb aria-label="New folder" onClick={() => (setName(''), setDialog('new'))} disabled={bin}>New folder</Tb>
          <Tb aria-label="Cut" disabled={!sel.length || bin} onClick={() => set((x) => coFsCopy(x, sel, true), 'fs:cut')}>Cut</Tb>
          <Tb aria-label="Copy" disabled={!sel.length || bin} onClick={() => set((x) => coFsCopy(x, sel, false), 'fs:copy')}>Copy</Tb>
          <Tb aria-label="Paste" disabled={!fs.clip || bin} onClick={() => res(coFsPaste(fs, dir), 'fs:paste')}>Paste</Tb>
          <Tb aria-label="Rename" disabled={!one || bin} onClick={() => (setName(one?.name ?? ''), setDialog('rename'))}>Rename</Tb>
          <Tb aria-label="Delete" disabled={!sel.length || bin} onClick={() => { const flash = dir === 'flash' || coFsPath(fs, dir).startsWith('E:'); set((x) => sel.reduce(coFsDelete, x), 'fs:delete'); if (flash) setMsg({ t: 'bad', x: 'Deleted from the flash drive: there is no Recycle Bin here, it is gone for good.' }); setSel([]); }}>Delete</Tb>
          <Tb aria-label="Properties" disabled={!one} onClick={() => { set((x) => ({ ...x, props: [...x.props.filter((p) => p !== one!.id), one!.id].slice(-16) }), 'fs:props'); setDialog('props'); }}>Properties</Tb>
          <Tb aria-label="Details view" on={fs.view === 'DETAILS'} onClick={() => set((x) => ({ ...x, view: x.view === 'DETAILS' ? 'ICONS' : 'DETAILS' }), 'fs:view')}>Details view</Tb>
          {fs.flash !== 'IN' ? (
            <Tb aria-label="Insert flash drive" onClick={() => set(coFsInsertFlash, 'fs:flash')}>Insert flash drive</Tb>
          ) : (
            <Tb aria-label="Eject flash drive" onClick={() => { set(coFsEject, 'fs:eject'); if (dir === 'flash' || coFsPath(fs, dir).startsWith('E:')) setDir('d'); setMsg({ t: 'good', x: 'Safe to remove the flash drive.' }); }}>Eject</Tb>
          )}
          <Tb aria-label="Command Prompt" onClick={() => setDialog('cmd')}>Command Prompt</Tb>
        </Tools>
      )}
      <div className="flex items-center gap-1 border-b border-slate-200 p-1">
        <Tb aria-label="Up one folder" disabled={!here?.parent || bin} onClick={up}>↑</Tb>
        <span aria-label="Address" className="min-w-0 flex-1 truncate rounded border border-slate-200 px-1.5 py-1 font-mono text-[12.5px]">{bin ? 'Recycle Bin' : `${coFsPath(fs, dir)}\\`}</span>
      </div>
      {msg && <Note tone={msg.t}>{msg.x}</Note>}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div aria-label="Drives" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-1 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r">
          {drives.map((n) => (
            <button key={n.id} type="button" aria-label={`Open ${n.name}`} onClick={() => (setDir(n.id), setBin(false), setSel([]))} className={cn('shrink-0 rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-slate-200', !bin && dir === n.id && 'bg-blue-100')}>{icon(n)} {n.name}</button>
          ))}
          <button type="button" aria-label="Recycle Bin" onClick={() => (setBin(true), setSel([]))} className={cn('shrink-0 rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-slate-200', bin && 'bg-blue-100')}>🗑 Recycle Bin ({coFsBin(fs).length})</button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-1">
          {!list.length && <p className="p-3 text-[12.5px] text-slate-500">{bin ? 'The Recycle Bin is empty.' : 'This folder is empty.'}</p>}
          {fs.view === 'DETAILS' && !bin ? (
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-slate-500"><th className="font-medium">Name</th><th className="font-medium">Type</th><th className="text-right font-medium">Size</th></tr></thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.id} aria-selected={sel.includes(n.id)} onClick={(e) => toggle(n.id, e.ctrlKey || e.metaKey)} onDoubleClick={() => open(n)} className={cn('cursor-default', sel.includes(n.id) && 'bg-blue-100')}>
                    <td className="py-1">{icon(n)} {n.name}{n.kind !== 'FILE' && <Tb className="ml-1 h-6" aria-label={`Open folder ${n.name}`} onClick={() => open(n)}>Open</Tb>}</td>
                    <td>{n.kind === 'FOLDER' ? 'File folder' : `${n.name.split('.').pop()?.toUpperCase()} file`}</td>
                    <td className="text-right tabular-nums">{n.kind === 'FILE' ? size(n.size) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1">
              {list.map((n) => (
                <div key={n.id} className={cn('rounded border p-1 text-center text-[12px]', sel.includes(n.id) ? 'border-blue-500 bg-blue-100' : 'border-transparent')}>
                  <button type="button" aria-label={n.name} aria-pressed={sel.includes(n.id)} onClick={(e) => toggle(n.id, e.ctrlKey || e.metaKey)} onDoubleClick={() => open(n)} className="w-full">
                    <span className="block text-2xl" aria-hidden>{icon(n)}</span>
                    <span className="break-all">{n.name}</span>
                  </button>
                  {bin && !ro && <Tb className="mt-1 h-7" aria-label={`Restore ${n.name}`} onClick={() => set((x) => coFsRestore(x, n.id), 'fs:restore')}>Restore</Tb>}
                  {!bin && n.kind !== 'FILE' && <Tb className="mt-1 h-7" aria-label={`Open folder ${n.name}`} onClick={() => open(n)}>Open</Tb>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] text-slate-600">{list.length} item{list.length === 1 ? '' : 's'}{fs.clip ? ` · ${fs.clip.ids.length} on the clipboard (${fs.clip.cut ? 'cut' : 'copied'})` : ''}</p>
      {dialog === 'new' && (
        <Modal title="New folder" onClose={() => setDialog(null)}>
          <Lbl text="Name"><input aria-label="Folder name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Lbl>
          <Pri aria-label="Create folder" onClick={() => (res(coFsMkdir(fs, dir, name), `fs:mkdir:${name}`), setDialog(null))}>Create</Pri>
        </Modal>
      )}
      {dialog === 'rename' && (
        <Modal title="Rename" onClose={() => setDialog(null)}>
          <Lbl text="New name"><input aria-label="New name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Lbl>
          <Pri aria-label="Rename now" onClick={() => (res(coFsRename(fs, sel[0]!, name), 'fs:rename'), setDialog(null))}>OK</Pri>
        </Modal>
      )}
      {dialog === 'props' && one && (
        <Modal title="Properties" onClose={() => setDialog(null)}>
          <p>{icon(one)} {one.name}</p>
          <p>Location: {coFsPath(fs, one.id)}</p>
          <p>Size: {size(coFsSize(fs, one.id))}</p>
          {one.kind !== 'FILE' && <p>Contains: {coFsKids(fs, one.id).filter((n) => n.kind === 'FILE').length} files, {coFsKids(fs, one.id).filter((n) => n.kind === 'FOLDER').length} folders</p>}
        </Modal>
      )}
      {dialog === 'cmd' && (
        <Modal title="Command Prompt" onClose={() => setDialog(null)} wide>
          <pre aria-label="Command output" className="max-h-44 overflow-auto rounded bg-black p-2 font-mono text-[12px] text-slate-100">{out}</pre>
          <div className="flex gap-1">
            <span className="self-center font-mono text-[12px]">&gt;</span>
            <input aria-label="Command" autoCapitalize="off" spellCheck={false} className={inputCls} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
            <Pri aria-label="Run command" onClick={run}>Enter</Pri>
          </div>
        </Modal>
      )}
    </div>
  );
}
