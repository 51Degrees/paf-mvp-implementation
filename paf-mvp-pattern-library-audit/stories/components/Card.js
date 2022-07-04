import Logo from './Logo';
import Button from './Button';
import Navigation, { NavigationState } from './Navigation';
import { Cross } from './Icons';

export const CardHeader = (props = {}) => `
  ${NavigationState()}

  <header class="ok-ui-card__header">
    ${props.children || `
      <div class="ok-ui-card__header-context">
        ${Logo()}

        <ul class="ok-ui-card__header-logos">
          <li>Logo 1</li>
          <li>Logo 2</li>
        </ul>

        <div class="ok-ui-card__header-close">
          ${Button({ style: 'text', icon: Cross(), iconOnly: true, label: 'Close' })}
        </div>
      </div>
      <nav class="ok-ui-card__header-navigation">
        <h1 class="ok-ui-heading-1">Advert audit</h1>

        ${Navigation({
          selected: props.navigationSelected
        })}
      </nav>
    `}
  </header>
`;

export const CardBody = (props = {}) => `<main class="ok-ui-card__body">
  ${props.children || 'Card body'}
</main>`;

export default (props = {}) => `
  <section tabindex="-1" role="dialog"${props.ariaTitleId ? ` aria-labelledby="${props.ariaTitleId}"` : ''} class="ok-ui-card${props.blocked ? ' ok-ui-card--blocked' : ''}">${props.children || `
    ${CardHeader()}
    ${CardBody()}
  `}</section>
`;