import { escapeLike } from './users.service';

// La búsqueda (S3-02) arma el patrón de LIKE con el texto del usuario: sus comodines
// deben quedar escapados. El resto de la búsqueda se prueba contra la base real en
// test/users-search.e2e-spec.ts.
describe('escapeLike', () => {
  it('deja igual un texto sin comodines', () => {
    expect(escapeLike('ana lopez')).toBe('ana lopez');
  });

  it('escapa % y _', () => {
    expect(escapeLike('100%_real')).toBe('100\\%\\_real');
  });

  it('escapa también la barra invertida, que es el carácter de escape', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});
