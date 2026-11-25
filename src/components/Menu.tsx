import { useCallback, useEffect, useRef, useState } from 'react';
import type Lenis from 'lenis';
import TextRoll from './TextRoll';
import { initMenu } from '../animations/initMenu';

interface MenuLink { label: string; href: string; tag?: string }
interface MenuColumn { title: string; links: MenuLink[]; className?: string }

const columns: MenuColumn[] = [
  { title: 'Home', links: [{ label: '系统首页', href: '#home' }, { label: '同答异因', href: '#compare', tag: 'Live demo' }, { label: '任意题诊断', href: '#freeform', tag: 'AI + Rules' }, { label: '做题诊断', href: '#practice' }, { label: '教师视图', href: '#teacher', tag: 'Local' }, { label: '方法说明', href: '#methodology' }] },
  {
    title: 'Works',
    className: 'menu-column--works',
    links: [
      { label: '比较两份草稿', href: '#compare', tag: 'Editable' },
      { label: '函数值求解', href: '#compare' },
      { label: '一元二次方程', href: '#works' },
      { label: '幂的运算法则', href: '#works' },
      { label: '对数定义', href: '#works' },
      { label: '古典概率', href: '#works' },
      { label: '知识依赖图谱', href: '#highlights' },
    ],
  },
  { title: 'Expertise', links: [{ label: '函数与方程', href: '#expertise' }, { label: '指数与对数', href: '#expertise' }, { label: '三角与数列', href: '#expertise' }, { label: '概率与集合', href: '#expertise' }] },
  { title: 'About', links: [{ label: '系统方法', href: '#methodology' }, { label: '五层模型', href: '#methodology' }, { label: '设计原则', href: '#methodology' }] },
  { title: 'Evidence', links: [{ label: '自动化测试', href: '#methodology' }, { label: '试用方案', href: '#contact' }, { label: '本地规则', href: '#home' }] },
];

export default function Menu({ lenis }: { lenis: React.RefObject<Lenis | null> }) {
  const [open, setOpen] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (overlay.current) return initMenu({ element: overlay.current, open, onClose: close, lenis: lenis.current });
  }, [open, close, lenis]);

  return (
    <>
      <header className="site-header">
        <a href="#home" className="site-logo display-font roll-trigger" aria-label="KD® Knowledge Detective 首页">
          <TextRoll text="KD®" />
        </a>
        <span className="site-header__center">SAME ANSWER / DIFFERENT EVIDENCE</span>
        <button className="menu-button roll-trigger" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="site-menu">
          <span className="status-dot" />
          <TextRoll text="MENU" />
        </button>
      </header>

      <div className="menu-overlay" id="site-menu" ref={overlay} role="dialog" aria-modal="true" aria-label="全屏导航" aria-hidden={!open}>
        <div className="menu-overlay__top">
          <span className="display-font">KD® / NAVIGATION</span>
          <button className="menu-close" onClick={close} tabIndex={open ? 0 : -1} aria-label="关闭菜单"><span /><span /></button>
        </div>
        <nav className="menu-columns" aria-label="网站栏目">
          {columns.map((column, columnIndex) => (
            <div className={`menu-column ${column.className || ''}`} key={column.title} data-menu-column>
              <div className="menu-column__title"><span>{column.title}</span><span>0{columnIndex + 1}</span></div>
              <div className="menu-column__links">
                {column.links.map((link) => (
                  <a key={link.label} href={link.href} onClick={close} tabIndex={open ? 0 : -1} className="menu-link roll-trigger">
                    <TextRoll text={link.label} />
                    {link.tag && <span className="menu-link__tag"><i className="status-dot" />{link.tag}</span>}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="menu-overlay__bottom"><span>KNOWLEDGE SYSTEM / 0001</span><span>ESC TO CLOSE</span></div>
      </div>
    </>
  );
}
