import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { OrbitTelemetryService } from './orbit-telemetry.service';
import { OrbitComponent } from './orbit.component';

describe('OrbitComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, FormsModule],
      declarations: [OrbitComponent],
      providers: [{ provide: OrbitTelemetryService, useValue: {
        status$: new BehaviorSubject('Not sharing'),
        connect: jasmine.createSpy('connect').and.returnValue(Promise.resolve(true)),
        publish: jasmine.createSpy('publish').and.returnValue(Promise.resolve()),
        disconnect: jasmine.createSpy('disconnect')
      } }]
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

  it('does not relay frame diagnostics until sharing is enabled, and filters foreign data', async () => {
    const fixture = TestBed.createComponent(OrbitComponent);
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    const component = fixture.componentInstance;
    const relay = TestBed.inject(OrbitTelemetryService);
    const data = { type: 'orbit:xr-report', report: JSON.stringify({
      report: 'Orbit XR diagnostics v1', environment: {}, attempt: null, events: []
    }) };
    component.onFrameMessage(new MessageEvent('message', { origin: window.location.origin, source: window, data }));
    component.onFrameMessage(new MessageEvent('message', { origin: 'https://foreign.example', source: frame.contentWindow, data }));
    expect((component as any).latestReport).toBe('');
    component.onFrameMessage(new MessageEvent('message', { origin: window.location.origin, source: frame.contentWindow, data }));
    expect(relay.publish).not.toHaveBeenCalled();
    component.wirelessKey = '12'.repeat(16);
    await component.startSharing();
    expect(relay.publish).toHaveBeenCalledTimes(1);
    component.stopSharing();
    expect(relay.disconnect).toHaveBeenCalled();
  });
});
