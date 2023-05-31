import type { Plugin, CustomRTE } from 'grapesjs';
import type CKE from 'ckeditor4';

export type PluginOptions = {
  /**
   * CKEditor's configuration options.
   * @see https://ckeditor.com/docs/ckeditor4/latest/api/CKEDITOR_config.html
   * @default {}
   */
  options?: CKE.config;

  /**
   * Pass CKEDITOR constructor or the CDN string from which the CKEDITOR will be loaded.
   * If this option is empty, the plugin will also check the global scope (eg. window.CKEDITOR)
   * @default 'https://cdn.ckeditor.com/4.21.0/standard-all/ckeditor.js'
   */
  ckeditor?: CKE.CKEditorStatic | string;

  /**
   * Position side of the toolbar.
   * @default 'left'
   */
  position?: 'left' | 'center' | 'right';

  /**
   * Extend the default customRTE interface.
   * @see https://grapesjs.com/docs/guides/Replace-Rich-Text-Editor.html
   * @default {}
   * @example
   * customRte: { parseContent: true, ... },
   */
  customRte?: Partial<CustomRTE>;
};

const isString = (value: any): value is string => typeof value === 'string';

const loadFromCDN = (url: string) => {
  const scr = document.createElement('script');
  scr.src = url;
  document.head.appendChild(scr);
  return scr;
}

const forEach = <T extends HTMLElement = HTMLElement>(items: Iterable<T>, clb: (item: T) => void) => {
  [].forEach.call(items, clb);
}

const stopPropagation = (ev: Event) => ev.stopPropagation();

const plugin: Plugin<PluginOptions> = (editor, options = {}) => {
  const opts: Required<PluginOptions> = {
    options: {},
    customRte: {},
    position: 'left',
    ckeditor: 'https://cdn.ckeditor.com/4.21.0/standard-all/ckeditor.js',
    ...options,
  };

  let ck: CKE.CKEditorStatic | undefined;
  const { ckeditor } = opts;
  const hasWindow = typeof window !== 'undefined';
  let dynamicLoad = false;

  // Check and load CKEDITOR constructor
  if (ckeditor) {
    if (isString(ckeditor)) {
      if (hasWindow) {
        dynamicLoad = true;
        const scriptEl = loadFromCDN(ckeditor);
        scriptEl.onload = () => {
          ck = window.CKEDITOR;
        }
      }
    } else if (ckeditor.inline!) {
      ck = ckeditor;
    }
  } else if (hasWindow) {
    ck = window.CKEDITOR;
  }

  const updateEditorToolbars = () => setTimeout(() => editor.refresh(), 0);
  const logCkError = () => {
    editor.log('CKEDITOR instance not found', { level: 'error' })
  };

  if (!ck && !dynamicLoad) {
    return logCkError();
  }

  const focus = (el: HTMLElement, rte?: CKE.editor) => {
    if (rte?.focusManager?.hasFocus) return;
    el.contentEditable = 'true';
    rte?.focus();
    updateEditorToolbars();
  };


  editor.setCustomRte({
    getContent(el, rte: CKE.editor) {
      return rte.getData();
    },

    enable(el, rte?: CKE.editor) {
      // If already exists I'll just focus on it
      if(rte && rte.status != 'destroyed') {
        focus(el, rte);
        return rte;
      }

      if (!ck) {
        logCkError();
        return;
      }

      // Seems like 'sharedspace' plugin doesn't work exactly as expected
      // so will help hiding other toolbars already created
      const rteToolbar = editor.RichTextEditor.getToolbarEl();
      forEach(rteToolbar.children as Iterable<HTMLElement>, (child) => {
        child.style.display = 'none';
      });

      // Check for the mandatory options
      const ckOptions = { ...opts.options };
      const plgName = 'sharedspace';

      if (ckOptions.extraPlugins) {
        if (typeof ckOptions.extraPlugins === 'string') {
          ckOptions.extraPlugins += `,${plgName}`;
        } else if (Array.isArray(ckOptions.extraPlugins)) {
          (ckOptions.extraPlugins as string[]).push(plgName);
        }
      } else {
        ckOptions.extraPlugins = plgName;
      }

      if(!ckOptions.sharedSpaces) {
        ckOptions.sharedSpaces = { top: rteToolbar };
      }

      // Init CKEDITOR
      rte = ck!.inline(el, ckOptions);

      // Make click event propogate
      rte.on('contentDom', () => {
        const editable = rte!.editable();
        editable.attachListener(editable, 'click', () => el.click());
      });

      // The toolbar is not immediatly loaded so will be wrong positioned.
      // With this trick we trigger an event which updates the toolbar position
      rte.on('instanceReady', () => {
        const toolbar = rteToolbar.querySelector<HTMLElement>(`#cke_${rte!.name}`);
        if (toolbar) {
          toolbar.style.display = 'block';
        }
        // Update toolbar position
        editor.refresh();
        // Update the position again as the toolbar dimension might have a new changed
        updateEditorToolbars();
      });

      // Prevent blur when some of CKEditor's element is clicked
      rte.on('dialogShow', () => {
        const els = document.querySelectorAll<HTMLElement>('.cke_dialog_background_cover, .cke_dialog_container');
        forEach(els, (child) => {
          child.removeEventListener('mousedown', stopPropagation);
          child.addEventListener('mousedown', stopPropagation);
        });
      });

      // On ENTER CKEditor doesn't trigger `input` event
      rte.on('key', (ev: any) => {
        ev.data.keyCode === 13 && updateEditorToolbars();
      });

      focus(el, rte);

      return rte;
    },

    disable(el, rte?: CKE.editor) {
      el.contentEditable = 'false';
      rte?.focusManager?.blur(true);
    },

    ...opts.customRte,
  });

  // Update RTE toolbar position
  editor.on('rteToolbarPosUpdate', (pos: any) => {
    const { elRect } = pos;

    switch (opts.position) {
      case 'center':
        pos.left = (elRect.width / 2) - (pos.targetWidth / 2);
        break;
      case 'right':
        pos.left = ''
        pos.right = 0;
        break;
    }
  });
};

export default plugin;
