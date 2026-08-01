import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabmanagerComponent } from './tabmanager.component';

describe('TabmanagerComponent', () => {
  let component: TabmanagerComponent;
  let fixture: ComponentFixture<TabmanagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TabmanagerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabmanagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
