import { describe, it, expect } from 'vitest';
import { sanitize, validatePassword } from '../lib/security.js';

describe('sanitize', () => {
  it('elimina caracteres peligrosos', () => {
    expect(sanitize('<script>alert(1)</script>')).toBe('scriptalert1/script');
    expect(sanitize('Robert"; DROP TABLE--')).toBe('Robert DROP TABLE--');
    expect(sanitize('Nombre Normal')).toBe('Nombre Normal');
  });

  it('respeta el limite de longitud', () => {
    const largo = 'a'.repeat(100);
    expect(sanitize(largo, 10).length).toBe(10);
  });

  it('retorna string vacio si no es string', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
    expect(sanitize(123)).toBe('');
  });
});

describe('validatePassword', () => {
  it('rechaza contrasenas cortas', () => {
    expect(validatePassword('abc')).toBe('Mínimo 8 caracteres');
  });

  it('rechaza sin mayuscula', () => {
    expect(validatePassword('password1')).toBe('Debe tener al menos una mayúscula');
  });

  it('rechaza sin numero', () => {
    expect(validatePassword('Password')).toBe('Debe tener al menos un número');
  });

  it('acepta contrasena valida', () => {
    expect(validatePassword('Password1')).toBeNull();
  });
});
