import DOMPurify from 'dompurify';
import {marked} from 'marked';
import {Meteor} from 'meteor/meteor';
import { clientConsole } from '../lib/clientLogger';
import './help.html';

declare const Template: {
  help: {
    helpers(map: Record<string, () => unknown>): void;
    rendered: () => Promise<void>;
  };
};

type MeteorWithCallAsync = typeof Meteor & {
  callAsync<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
};

// Configure marked for secure rendering
marked.setOptions({
  breaks: true,        // Convert \n to <br>
  gfm: true,          // GitHub Flavored Markdown
});

// Convert markdown to sanitized HTML
function convertMarkdownToHTML(markdown: string): string {
  // Parse markdown with marked
  const html = marked.parse(markdown) as string;

  // Sanitize the HTML to prevent XSS
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div',
                   'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'table', 'tr', 'td', 'th', 'thead', 'tbody',
                   'ul', 'ol', 'li', 'center', 'a', 'code', 'pre', 'blockquote', 'hr'],
    ALLOWED_ATTR: ['style', 'class', 'id', 'href', 'target'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

Template.help.helpers({
  ownerContact() {
    return Meteor.settings.public?.admin || null;
  }
});

Template.help.rendered = async function() {
  // Fetch and render the help content
  try {
    let markdown: string;

    // First, check for custom help page
    const customHelp = await (Meteor as MeteorWithCallAsync).callAsync<string | null>('getCustomHelpPage');

    if (customHelp) {
      // Use custom help markdown
      markdown = customHelp;
    } else {
      // Fall back to GitHub wiki
      const response = await fetch('https://raw.githubusercontent.com/wiki/memphis-iis/mofacts/Student-Overview.md');
      if (!response.ok) {
        throw new Error('Failed to load help content');
      }
      markdown = await response.text();
    }

    // Convert markdown to HTML
    const html = convertMarkdownToHTML(markdown);

    // Update page content
    const helpContent = document.getElementById('helpContent');
    if (helpContent) {
      helpContent.innerHTML = html;
    }

    // Ensure body styles from offcanvas are cleared before fade-in
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // Trigger fade-in with stable layout (page-container prevents reflow)
    const container = document.getElementById('helpContainer');
    if (container) {
      container.classList.remove('page-loading');
      container.classList.add('page-loaded');
    }
  } catch (error: unknown) {
    const helpContent = document.getElementById('helpContent');
    if (helpContent) {
      helpContent.innerHTML = `
      <div class="alert alert-warning">
        <p>Unable to load help content. Please try again later or visit our
        <a href="https://github.com/memphis-iis/mofacts/wiki/Student-Overview" target="_blank" class="content-link">online help guide</a>.</p>
      </div>
    `;
    }
    // Ensure body styles from offcanvas are cleared before fade-in
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    // Trigger fade-in with stable layout (page-container prevents reflow)
    const container = document.getElementById('helpContainer');
    if (container) {
      container.classList.remove('page-loading');
      container.classList.add('page-loaded');
    }
    clientConsole(1, '[Help] Error loading help content:', error);
  }
};

