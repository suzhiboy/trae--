import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, List, PlugZap, Settings2 } from 'lucide-react';
import {
  activeAiRequest,
  clearAiKey,
  editAiKey,
  editAiModel,
  editAiVisionModel,
  enableAiKey,
  getAiSettings,
  recordAiFailure,
  recordAiSuccess,
  selectAiMode,
  selectAiProvider,
  syncAiProviders,
  useAiSettings,
} from '../../services/aiCredential';
import { fetchProviderModels, testAiConnection } from '../../services/aiProvider';
import type { AiHealth } from '../../services/freeformDiagnosis';
import type { AiCredentialMode, AiProviderInfo } from '../../types';

type ProbeState = { kind: 'success' | 'error' | 'ignored'; message: string } | null;

function protocolLabel(protocol: AiProviderInfo['protocol']): string {
  return protocol === 'anthropic' ? 'Anthropic Messages' : 'OpenAI Chat Completions';
}

function uniqueModels(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

export default function AiSettings({
  open,
  health,
  providers,
  onClose,
}: {
  open: boolean;
  health: AiHealth | null;
  providers: AiProviderInfo[];
  onClose: () => void;
}) {
  const settings = useAiSettings();
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbeState>(null);
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelListNote, setModelListNote] = useState('');
  const [modelListLoading, setModelListLoading] = useState(false);

  const selected = providers.find((provider) => provider.id === settings.providerId)
    ?? providers.find((provider) => provider.isDefault)
    ?? providers[0]
    ?? null;

  useEffect(() => {
    if (!open || providers.length === 0) return;
    syncAiProviders(providers, health?.defaultProviderId);
  }, [open, providers, health?.defaultProviderId]);

  useEffect(() => {
    if (!open || !selected) return;
    if (settings.mode === 'custom' && !selected.customKey) {
      const next = providers.find((provider) => provider.customKey);
      if (next) selectAiProvider(next);
    }
    if (settings.mode === 'site' && !selected.siteKey) {
      const next = providers.find((provider) => provider.siteKey);
      if (next) selectAiProvider(next);
    }
  }, [open, selected, providers, settings.mode]);

  if (!open) return null;

  const keyFilled = settings.key.trim().length > 0;
  const siteModel = selected?.textModels[0] ?? health?.model ?? '';
  const siteVisionModel = selected?.visionModels[0] ?? selected?.textModels[0] ?? health?.visionModel ?? '';
  const customModel = settings.textModel.trim();
  const customVisionModel = settings.visionModel.trim() || customModel;
  const textModelValue = settings.mode === 'custom' ? customModel : siteModel;
  const visionModelValue = settings.mode === 'custom' ? customVisionModel : siteVisionModel;
  const textOptions = uniqueModels([
    ...(selected?.textModels ?? []),
    ...(selected?.suggestedTextModels ?? []),
    ...modelList,
  ]);
  const visionOptions = uniqueModels([
    ...(selected?.visionModels ?? []),
    ...(selected?.suggestedVisionModels ?? []),
    ...modelList,
  ]);
  const canTest = Boolean(selected) && !testing && (settings.mode === 'custom'
    ? settings.enabled && keyFilled
    : selected?.siteKey === true);
  const canListModels = Boolean(selected?.customKey) && settings.mode === 'custom'
    && settings.enabled && keyFilled && !modelListLoading;

  const chooseMode = (mode: AiCredentialMode) => {
    selectAiMode(mode);
    setProbe(null);
    setModelList([]);
    setModelListNote('');
    if (mode === 'custom' && selected) {
      const text = selected.textModels[0] || selected.suggestedTextModels[0] || '';
      const vision = selected.visionModels[0] || selected.suggestedVisionModels[0] || '';
      if (text && !settings.textModel) editAiModel(text);
      if (vision && !settings.visionModel) editAiVisionModel(vision);
    }
  };

  const chooseProvider = (providerId: string) => {
    const next = providers.find((provider) => provider.id === providerId);
    if (!next) return;
    selectAiProvider(next);
    setProbe(null);
    setModelList([]);
    setModelListNote('');
  };

  const runTest = async () => {
    if (testing) return;
    const credential = activeAiRequest();
    if (!credential) return;
    setTesting(true);
    setProbe(null);
    const response = await testAiConnection(credential);
    setTesting(false);
    if (getAiSettings().revision !== credential.revision) {
      setProbe({ kind: 'ignored', message: '设置已更改，本次测试结果已忽略。请用当前设置重新测试。' });
      return;
    }
    if (response.ok) {
      recordAiSuccess(credential);
      setProbe({
        kind: 'success',
        message: `已实际连接：${selected?.label ?? '当前供应商'} · ${response.model}，耗时 ${response.latencyMs} ms，返回「${response.reply}」。`,
      });
      return;
    }
    recordAiFailure(credential, response.code, response.message);
    setProbe({ kind: 'error', message: response.message });
  };

  const runModelList = async () => {
    if (modelListLoading) return;
    const credential = activeAiRequest();
    if (!credential || credential.mode !== 'custom') return;
    setModelListLoading(true);
    setModelListNote('');
    const response = await fetchProviderModels(credential);
    setModelListLoading(false);
    if (getAiSettings().revision !== credential.revision) {
      setModelListNote('设置已更改，本次模型列表结果已忽略。');
      return;
    }
    if (response.ok) {
      setModelList(response.models);
      setModelListNote(`已读取 ${response.models.length} 个模型，可在输入框选择或继续手填。`);
      return;
    }
    if (response.code === 'custom-key-invalid') {
      recordAiFailure(credential, response.code, response.message);
    }
    setModelListNote(response.message);
  };

  const statusText = (): string => {
    if (!selected) return '正在读取服务端供应商配置…';
    if (settings.mode === 'site') {
      if (!selected.siteKey) return '该供应商没有配置站点 Key。请选择其它供应商，或改用「使用自己的 Key」。';
      if (settings.status === 'connected') {
        return `已实际连接：${selected.label} · ${siteModel || '模型由服务端配置'}`;
      }
      if (settings.status === 'error') return `站点连接未完成：${settings.statusMessage}`;
      return '站点配置已加载。站点 Key 只存在服务端；点击「测试连接」可验证实际连通性。';
    }
    if (!selected.customKey) return '该供应商不允许自定义 Key，请选择其它供应商。';
    if (!keyFilled) return '尚未填写 Key。填写后还需点击「启用」；只有服务商实际响应后才显示「已实际连接」。';
    if (!settings.enabled) return '已填写 Key，尚未启用。点击「启用」后才会用于请求。';
    if (settings.status === 'connected') {
      return `已实际连接：${selected.label} · ${customModel || selected.textModels[0] || '手填模型'}`;
    }
    if (settings.status === 'invalid') return `Key 无效或没有权限：${settings.statusMessage}`;
    if (settings.status === 'error') return `已启用，但连接未完成：${settings.statusMessage}`;
    return '已启用，尚未实际连接。点击「测试连接」发送一个最小请求验证。';
  };

  return (
    <section className="ai-settings" id="ai-settings" data-testid="ai-settings" aria-labelledby="ai-settings-title">
      <div className="ai-settings__head">
        <div>
          <span><Settings2 aria-hidden="true" />AI SETTINGS</span>
          <h3 id="ai-settings-title">选择这次诊断使用的供应商与凭证</h3>
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
            onChange={() => chooseMode('site')}
          />
          <span>使用站点配置</span>
        </label>
        <label className={`ai-settings__mode${settings.mode === 'custom' ? ' is-active' : ''}`}>
          <input
            data-testid="ai-mode-custom"
            type="radio"
            name="ai-credential-mode"
            checked={settings.mode === 'custom'}
            onChange={() => chooseMode('custom')}
          />
          <span>使用自己的 Key</span>
        </label>
      </div>

      {providers.length === 0 ? (
        <p className="ai-settings__note">正在读取服务端供应商配置…</p>
      ) : (
        <>
          <label className="ai-settings__field">
            <span>供应商</span>
            <select
              data-testid="ai-provider-select"
              value={selected?.id ?? ''}
              onChange={(event) => chooseProvider(event.target.value)}
            >
              {providers.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={settings.mode === 'site' ? !provider.siteKey : !provider.customKey}
                >
                  {provider.label}
                  {settings.mode === 'site' && !provider.siteKey ? '（无站点 Key）' : ''}
                  {settings.mode === 'custom' && !provider.customKey ? '（不允许自定义 Key）' : ''}
                </option>
              ))}
            </select>
          </label>

          <dl className="ai-settings__info">
            <div>
              <dt>接口协议</dt>
              <dd data-testid="ai-provider-protocol">{selected ? protocolLabel(selected.protocol) : '—'}</dd>
            </div>
            <div>
              <dt>实际接收请求的域名</dt>
              <dd data-testid="ai-domain">
                {selected?.domain ? `${selected.domain}${selected.basePath}` : '由服务端配置'}
              </dd>
            </div>
            <div>
              <dt>文本模型</dt>
              <dd>{textModelValue || '未配置'}</dd>
            </div>
            <div>
              <dt>图片模型</dt>
              <dd>{visionModelValue || '未配置（图片识别不可用）'}</dd>
            </div>
          </dl>
        </>
      )}

      {settings.mode === 'site' ? (
        <p className={`ai-settings__${selected && !selected.siteKey ? 'warning' : 'note'}`}>
          {selected && !selected.siteKey
            ? '该供应商没有配置站点 Key。站点模式不会改用你自己的 Key；可以切换到「使用自己的 Key」，或选择其它站点供应商。'
            : '站点模式的上游地址、模型范围和 Key 都由服务端配置决定，浏览器只提交公开的供应商标识，不能改变 Key 的发送目的地。'}
        </p>
      ) : (
        <>
          {!selected?.customKey && (
            <p className="ai-settings__warning">该供应商不允许自定义 Key，请选择其它供应商。</p>
          )}

          <div className="ai-settings__fields">
            <label className="ai-settings__field">
              <span>文本模型 ID</span>
              <input
                data-testid="ai-model-input"
                type="text"
                list="ai-model-options"
                value={settings.textModel}
                onChange={(event) => editAiModel(event.target.value)}
                placeholder="例如 gpt-4o-mini、deepseek-chat、ep-... 或中转站别名"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <datalist id="ai-model-options">
                {textOptions.map((model) => <option key={model} value={model} />)}
              </datalist>
            </label>

            <label className="ai-settings__field">
              <span>图片模型 ID <small>可选；留空时尝试文本模型</small></span>
              <input
                data-testid="ai-vision-model-input"
                type="text"
                list="ai-vision-model-options"
                value={settings.visionModel}
                onChange={(event) => editAiVisionModel(event.target.value)}
                placeholder="支持图片的模型 ID；纯文本模型可留空"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <datalist id="ai-vision-model-options">
                {visionOptions.map((model) => <option key={model} value={model} />)}
              </datalist>
            </label>
          </div>

          <label className="ai-settings__key">
            <span><KeyRound aria-hidden="true" />API Key</span>
            <div className="ai-settings__key-row">
              <input
                data-testid="ai-key-input"
                type={visible ? 'text' : 'password'}
                value={settings.key}
                onChange={(event) => editAiKey(event.target.value)}
                placeholder={`填写 ${selected?.label ?? '所选供应商'} 的 API Key`}
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

          <div className="ai-settings__badges" aria-label="凭证状态">
            <span className={keyFilled ? 'is-on' : ''}>已填写</span>
            <span className={settings.enabled ? 'is-on' : ''}>已启用</span>
            <span className={settings.status === 'connected' ? 'is-on' : ''}>已实际连接</span>
          </div>
        </>
      )}

      <div className="ai-settings__actions">
        {settings.mode === 'custom' && (
          <button
            data-testid="ai-key-enable"
            type="button"
            className="outline-button"
            onClick={enableAiKey}
            disabled={!keyFilled || !selected?.customKey}
          >
            启用
          </button>
        )}
        <button
          data-testid="ai-test-connection"
          type="button"
          className="outline-button"
          onClick={runTest}
          disabled={!canTest}
        >
          <PlugZap aria-hidden="true" />
          {testing ? '正在测试…' : '测试连接'}
        </button>
        {settings.mode === 'custom' && (
          <button
            data-testid="ai-model-list"
            type="button"
            className="practice-text-button"
            onClick={runModelList}
            disabled={!canListModels}
          >
            <List aria-hidden="true" />
            {modelListLoading ? '正在读取…' : '读取模型列表'}
          </button>
        )}
        {settings.mode === 'custom' && (
          <button
            data-testid="ai-key-clear"
            type="button"
            className="practice-text-button"
            onClick={() => {
              clearAiKey();
              setVisible(false);
              setProbe(null);
              setModelList([]);
              setModelListNote('');
            }}
          >
            清除
          </button>
        )}
      </div>

      <p
        data-testid="ai-key-status"
        className={`ai-settings__status is-${settings.status}`}
        role="status"
        aria-live="polite"
      >
        {statusText()}
      </p>

      {probe && (
        <p
          data-testid="ai-probe-status"
          className={`ai-settings__probe is-${probe.kind}`}
          role="status"
          aria-live="polite"
        >
          {probe.kind === 'success' && <CheckCircle2 aria-hidden="true" />}
          <span>{probe.message}</span>
        </p>
      )}

      {modelListNote && (
        <p className="ai-settings__note" role="status">{modelListNote}</p>
      )}

      {settings.mode === 'custom' && (
        <p id="ai-key-note" className="ai-settings__note">
          Key 仅在本页内存有效，刷新或切换供应商即清除；调用时经本站后端转发，费用计入你的服务商账户。
          请求只发往本站 <code>/api</code>，不会进入 URL、浏览器持久存储、本站日志或学习报告。
          「已填写」「已启用」「已实际连接」是三个不同状态，只有服务商实际响应后才算连接成功。
        </p>
      )}
    </section>
  );
}
