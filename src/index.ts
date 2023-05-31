import type { Plugin } from 'grapesjs';
import type CKE from 'ckeditor4';

export type PluginOptions = {
  /**
   * CKEditor's configuration options.
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
};

const plugin: Plugin<PluginOptions> = (editor, options = {}) => {
  const opts: Required<PluginOptions> = {
    options: {},
    position: 'left',
    ckeditor: '',
    ...options,
  };

  let ck: CKE.CKEditorStatic | undefined;

  ck = window.CKEDITOR;

  if (!ck) {
    return editor.log('CKEDITOR instance not found', { level: 'error' });
  }

  const stopPropagation = (ev: Event) => ev.stopPropagation();
  const updateEditorToolbars = () => setTimeout(() => editor.refresh(), 0);

  const focus = (el: HTMLElement, rte?: CKE.editor) => {
    // Do nothing if already focused
    if (rte?.focusManager?.hasFocus) return;
    el.contentEditable = 'true';
    rte?.focus();
    updateEditorToolbars();
  };


  editor.setCustomRte({
    // parseContent: true,
    getContent(el, rte: CKE.editor) {
      return rte.getData();
    },

    enable(el, rte?: CKE.editor) {
      // If already exists I'll just focus on it
      if(rte && rte.status != 'destroyed') {
        focus(el, rte);
        return rte;
      }

      // Seems like 'sharedspace' plugin doesn't work exactly as expected
      // so will help hiding other toolbars already created
      const rteToolbar = editor.RichTextEditor.getToolbarEl();
      // [].forEach.call(rteToolbar.children, (child) => {
      //   child.style.display = 'none';
      // });

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

      // Init CkEditors
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
        // TODO
        // const editorEls = grapesjs.$('.cke_dialog_background_cover, .cke_dialog');
        // ['off', 'on'].forEach(m => editorEls[m]('mousedown', stopPropagation));
      });

      // On ENTER doesn't trigger `input` event
      rte.on('key', (ev: any) => {
        ev.data.keyCode === 13 && updateEditorToolbars();
      });

      focus(el, rte);

      return rte;
    },

    disable(el, rte?: CKE.editor) {
      el.contentEditable = '';
      rte?.focusManager?.blur(true);
    },
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
