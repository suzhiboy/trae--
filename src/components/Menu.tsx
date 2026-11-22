import { useCallback, useEffect, useRef, useState } from 'react';
import type Lenis from 'lenis';
import CityClock from './CityClock';
import TextRoll from './TextRoll';
import { initMenu } from '../animations/initMenu';

interface MenuLink { label: string; href: string; tag?: string }
interface MenuColumn { title: string; links: MenuLink[]; className?: string }

const columns: MenuColumn[] = [
  { title: 'Home', links: [{ label: '系统首页', href: '#home' }, { label: '诊断笔记', href: '#highlights' }, { label: '方法说明', href: '#methodology' }] },
  {
    title: 'Works',
    className: 'menu-column--works',
    links: [
      { label: '函数值求解', href: '#works', tag: 'Rule-backed' },
      { label: '一元二次方程', href: '#works' },
      { label: '幂的运算法则', href: '#works' },
      { label: '对数定义', href: '#works', tag: 'In progress' },
      { label: '等差数列', href: '#works' },
      { label: '古典概率', href: '#works' },
      { label: '知识依赖图谱', href: '#highlights', tag: 'Interactive' },
      { label: '历史验证', href: '#contact' },
    ],
  },
  { title: 'Expertise', links: [{ label: '函数与方程', href: '#expertise' }, { label: '指数与对数', href: '#expertise' }, { label: '数列与概率', href: '#expertise' }, { label: '诊断规则', href: '#expertise' }] },
  { title: 'About', links: [{ label: '系统方法', href: '#methodology' }, { label: '五层模型', href: '#methodology' }, { label: '设计原则', href: '#methodology' }] },
  { title: 'Contact', links: [{ label: '演示交流', href: '#contact' }, { label: '复制邮箱', href: 'mailto:hello@example.com' }, { label: '语言切换', href: '#contact' }] },
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
        <a href="#home" className="site-logo display-font roll-trigger" aria-label="Knowledge Detective 首页">
          <TextRoll text="KD®" />
        </a>
        <CityClock />
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
