import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabcreatorComponent } from './tabcreator.component';

describe('TabcreatorComponent', () => {
  let component: TabcreatorComponent;
  let fixture: ComponentFixture<TabcreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TabcreatorComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabcreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
