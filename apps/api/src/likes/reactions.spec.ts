import { isReaction, REACTIONS, topReactions } from './reactions';

describe('reacciones', () => {
  it('son las 6 de S4-12, en el orden que desempata', () => {
    expect(REACTIONS).toEqual(['like', 'love', 'haha', 'wow', 'sad', 'angry']);
  });

  it('isReaction rechaza un valor que no existe', () => {
    expect(isReaction('love')).toBe(true);
    expect(isReaction('dislike')).toBe(false);
  });

  describe('topReactions', () => {
    it('ordena de la más usada a la menos usada y deja hasta 3', () => {
      expect(
        topReactions([
          { reaction: 'like', count: 1 },
          { reaction: 'sad', count: 5 },
          { reaction: 'love', count: 3 },
          { reaction: 'wow', count: 2 },
        ]),
      ).toEqual(['sad', 'love', 'wow']);
    });

    it('un empate sigue el orden de la lista', () => {
      expect(
        topReactions([
          { reaction: 'angry', count: 2 },
          { reaction: 'haha', count: 2 },
          { reaction: 'like', count: 2 },
        ]),
      ).toEqual(['like', 'haha', 'angry']);
    });

    it('ignora valores desconocidos y conteos en cero', () => {
      expect(
        topReactions([
          { reaction: 'dislike', count: 9 },
          { reaction: 'love', count: 0 },
          { reaction: 'wow', count: 1 },
        ]),
      ).toEqual(['wow']);
    });

    it('sin reacciones devuelve una lista vacía', () => {
      expect(topReactions([])).toEqual([]);
    });
  });
});
