import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { OrbitComponent } from './orbit.component';

describe('OrbitComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [OrbitComponent]
    }).compileComponents();
  });

  it('embeds the local Orbit asset with an accessible title', () => {
    const fixture = TestBed.createComponent(OrbitComponent);
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('assets/orbit/index.html');
    expect(frame.title).toContain('Orbit');
    expect(frame.getAttribute('allow')).toContain('xr-spatial-tracking');
  });

  it('provides a route back to home', () => {
    const fixture = TestBed.createComponent(OrbitComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/');
  });

  it('resizes from a valid same-origin message sent by its own frame', () => {
    const fixture = TestBed.createComponent(OrbitComponent);
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    fixture.componentInstance.onFrameMessage(new MessageEvent('message', {
      origin: window.location.origin, source: frame.contentWindow,
      data: { type: 'orbit:resize', height: 641.5 }
    }));
    fixture.detectChanges();
    expect(frame.style.height).toBe('642px');
  });

  it('ignores foreign sources, origins and malformed heights', () => {
    const fixture = TestBed.createComponent(OrbitComponent);
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const component = fixture.componentInstance;
    const base = { origin: window.location.origin, source: frame.contentWindow };
    for (const height of [NaN, Infinity, -1, 199, 5001, '700', null]) {
      component.onFrameMessage(new MessageEvent('message', { ...base, data: { type: 'orbit:resize', height } }));
    }
    component.onFrameMessage(new MessageEvent('message', {
      ...base, origin: 'https://untrusted.example', data: { type: 'orbit:resize', height: 500 }
    }));
    component.onFrameMessage(new MessageEvent('message', {
      ...base, source: window, data: { type: 'orbit:resize', height: 500 }
    }));
    component.onFrameMessage(new MessageEvent('message', { ...base, data: null }));
    expect(component.frameHeight).toBe(800);
  });
});
