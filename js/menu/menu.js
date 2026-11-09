// Lot 8a : menu principal E8 (Docs/ref/menu-principal.md). Partie B : socle provisoire, le seul bouton « JOUER » (le menu complet vient en partie C).
export function creerMenu({ dict, jouer, root = document.body }) {
  const box = document.createElement('div');
  box.id = 'e8';
  box.className = 'e8';
  box.dataset.block = 'E8';
  const main = document.createElement('main');
  main.setAttribute('aria-label', dict['game.menu.aria']);
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.id = 'menu-jouer';
  bouton.className = 'menu-peint';
  bouton.textContent = dict['game.menu.jouer.bouton'];
  bouton.addEventListener('click', () => {
    box.remove();
    jouer();
  });
  main.append(bouton);
  box.append(main);
  root.append(box);
  return { element: box };
}
