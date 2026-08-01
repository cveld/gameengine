import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabhostComponent } from './tabhost.component';

describe('TabhostComponent', () => {
  let component: TabhostComponent;
  let fixture: ComponentFixture<TabhostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TabhostComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabhostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
