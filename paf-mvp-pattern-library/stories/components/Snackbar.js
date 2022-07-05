import Logo from './Logo';

export default (args) => {
  const title = args.title;

  return `<section  tabindex="-1" role="dialog" aria-labelledby="ok-ui-snackbar-title" class="ok-ui-snackbar">
    <div class="ok-ui-snackbar__body">
      <h1 class="ok-ui-heading-1" id="ok-ui-snackbar-title">${title}</h1>
      <p>Turn <a href="#" class="ok-ui-link">personalized marketing</a> on at any time to make your ads more relevant.</p>
    </div>
    <footer class="ok-ui-snackbar__footer">
      ${Logo()}
    </footer>
  </section>`;
};