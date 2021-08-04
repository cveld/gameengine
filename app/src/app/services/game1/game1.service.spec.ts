import { TestBed } from '@angular/core/testing';

import { Game1Service } from './game1.service';

describe('Game1Service', () => {
  let service: Game1Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Game1Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
