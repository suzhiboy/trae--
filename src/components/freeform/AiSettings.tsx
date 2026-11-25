import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Settings2 } from 'lucide-react';
import {
  clearAiKey,
  editAiKey,
  enableAiKey,
  selectAiMode,
  useAiSettings,
} from '../../services/aiCredential';
import type { AiHealth } from '../../services/freeformDiagnosis';

function statusText(
  status: ReturnType<typeof useAiSettings>['status'],
  message: string,
  enabled: boolean,
  customReady: boolean,
): string {
  if (!customReady) return '站点未配置模型，无法启用自定义 Key。';
  if (!enabled) return '未启用。填写 Key 后点击「启用」；启用只表示设置生效，不会发起测试请求。';
  if (status === 'connected') return '连接成功：服务商已实际响应。';
  if (status === 'invalid') return `Key 无效：${message}`;
  if (status === 'error') return `连接未完成：${message}`;
  return '已启用，尚未验证。只有服务商实际响应成功后才会显示「连接成功」。';
}

export default function AiSettings({
  open,
  health,
  onClose,
}: {
  open: boolean;
  health: AiHealth | null;
  onClose: () => void;
}) {
  const settings = useAiSettings();
  const [visible, setVisible] = useState(false);
  if (!open) return null;

  const customReady = health?.customKeyReady === true;
  const provider = health?.provider || '站点配置的服务商';
  const model = health?.model || '未配置';
  const status = statusText(settings.status, settings.statusMessage, settings.enabled, customReady);

  return (
    <section className="ai-settings" id="ai-settings" data-testid="ai-settings" aria-labelledby="ai-settings-title">
      <div className="ai-settings__head">
        <div>
          <span><Settings2 aria-hidden="true" />AI SETTINGS</span>
          <h3 id="ai-settings-title">选择这次诊断使用的凭证</h3>
        </div>
        <button type="button" className="practice-text-button" onClick={onClose}>收起</button>
      </div>

      <div className="ai-settings__modes" role="radiogroup" aria-label="AI 凭证来源">
        <label className={`ai-settings__mode${settings.mode === 'site' ? ' is-active' : ''}`}>
          <input
            data-testid="ai-mode-site"
            type="radio"
            name="ai-credential-mode"
            checked={settings.mode === 'site'}
            onChange={() => selectAiMode('site')}
          />
          <span>使用站点配置</span>
        </label>
        <label className={`ai-settings__mode${settings.mode === 'custom' ? ' is-active' : ''}`}>
          <input
            data-testid="ai-mode-custom"
            type="radio"
            name="ai-credential-mode"
            checked={settings.mode === 'custom'}
            onChange={() => selectAiMode('custom')}
          />
          <span>使用自己的 API Key</span>
        </label>
      </div>

      <p className="ai-settings__meta">
        服务商：{provider} · 模型：{model}
      </p>

      {settings.mode === 'site' ? (
        <p className="ai-settings__note">
          {health?.ai
            ? '站点已配置默认 Key。内置规则仍优先，只有规则无法判断时才调用 AI。'
            : '站点没有配置默认 Key。你可以切换到「使用自己的 API Key」，不会影响内置 12 题和比较草稿。'}
        </p>
      ) : (
        <>
          {!customReady && (
            <p className="ai-settings__warning">
              站点尚未配置模型 ID，自定义 Key 暂不可用。需要管理员在服务端设置 AI_MODEL。
            </p>
          )}

          <label className="ai-settings__key">
            <span><KeyRound aria-hidden="true" />API Key</span>
            <div className="ai-settings__key-row">
              <input
                data-testid="ai-key-input"
                type={visible ? 'text' : 'password'}
                value={settings.key}
                onChange={(event) => editAiKey(event.target.value)}
                placeholder={`填写 ${provider} 的 API Key`}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-describedby="ai-key-note"
              />
              <button
                data-testid="ai-key-toggle"
                type="button"
                className="practice-text-button"
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                {visible ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          <div className="ai-settings__actions">
            <button
              data-testid="ai-key-enable"
              type="button"
              className="outline-button"
              onClick={enableAiKey}
              disabled={!settings.key.trim() || !customReady}
            >
              启用
            </button>
            <button
              data-testid="ai-key-clear"
              type="button"
              className="practice-text-button"
              onClick={() => {
                clearAiKey();
                setVisible(false);
              }}
            >
              清除
            </button>
          </div>

          <p id="ai-key-note" className="ai-settings__note">
            Key 仅在本页有效，调用时经本站后端转发，费用计入你的服务商账户。
            请求只发往本站 <code>/api</code>，不会进入 URL、浏览器持久存储、本站日志或学习报告。
          </p>
          <p
            data-testid="ai-key-status"
            className={`ai-settings__status is-${settings.status}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
        </>
      )}
    </section>
  );
}
