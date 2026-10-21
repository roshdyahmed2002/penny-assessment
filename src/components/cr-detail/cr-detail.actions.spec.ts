import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { SessionService } from '../../session/session.service';
import { CrDetailComponent } from './cr-detail.component';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

interface RenderedDetail {
	fixture: ComponentFixture<CrDetailComponent>;
	api: CrApiService;
	el: HTMLElement;
	cmp: CrDetailComponent;
}

async function render(user: ReqUser = users.approver, id = 'CR-1'): Promise<RenderedDetail> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const api = TestBed.inject(CrApiService);
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges();
	await flush();
	fixture.detectChanges();
	return { fixture, api, el: fixture.nativeElement, cmp: fixture.componentInstance };
}

async function settle(fixture: ComponentFixture<CrDetailComponent>): Promise<void> {
	await flush();
	await flush();
	await flush();
	fixture.detectChanges();
}

function typeReason(el: HTMLElement, reason: string): void {
	const textarea: HTMLTextAreaElement = el.querySelector('.cr-actions__reason');
	textarea.value = reason;
	textarea.dispatchEvent(new Event('input'));
	textarea.dispatchEvent(new Event('blur'));
}

const failLater = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Network error')), 0));

afterEach(() => jest.useRealTimers());

describe('CrDetailComponent actions', () => {
	it('keeps Reject disabled until a reason is entered', async () => {
		const { fixture, el } = await render();
		const rejectButton: HTMLButtonElement = el.querySelector('.cr-actions__reject-btn');
		expect(rejectButton.disabled).toBe(true);
		typeReason(el, 'Not agreed');
		fixture.detectChanges();
		expect(rejectButton.disabled).toBe(false);
	});

	it('rejects a whitespace-only reason', async () => {
		const { fixture, el } = await render();
		typeReason(el, '   ');
		fixture.detectChanges();
		expect((el.querySelector('.cr-actions__reject-btn') as HTMLButtonElement).disabled).toBe(true);
		expect(el.querySelector('.cr-actions__reason-error').textContent).toContain('Please enter a reason.');
	});

	it('does not call the API when reject is invoked without a reason', async () => {
		const { api, cmp } = await render();
		const reject = jest.spyOn(api, 'reject');
		await cmp.reject();
		expect(reject).not.toHaveBeenCalled();
	});

	it('does not call the API when a viewer invokes approve', async () => {
		const { api, cmp } = await render(users.viewer);
		const approve = jest.spyOn(api, 'approve');
		await cmp.approve();
		expect(approve).not.toHaveBeenCalled();
	});

	it('approves the CR and removes the available actions', async () => {
		const { fixture, el, cmp } = await render();
		await cmp.approve();
		await settle(fixture);
		expect(el.querySelector('.cr-status').textContent).toContain('APPROVED');
		expect(
			Array.from(el.querySelectorAll('.cr-timeline__action'))
				.map((entry: Element) => entry.textContent)
				.at(-1),
		).toBe('APPROVE');
		expect((el.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
		expect(el.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('rejects with a trimmed reason and renders it in the timeline', async () => {
		const { fixture, api, el, cmp } = await render();
		const reject = jest.spyOn(api, 'reject');
		typeReason(el, '  Price not agreed  ');
		fixture.detectChanges();
		await cmp.reject();
		await settle(fixture);
		expect(reject).toHaveBeenCalledWith(users.approver, 'CR-1', expect.any(String), 'Price not agreed');
		expect(el.querySelector('.cr-status').textContent).toContain('REJECTED');
		expect(Array.from(el.querySelectorAll('.cr-timeline__note')).at(-1).textContent).toBe('Price not agreed');
	});

	it('disables both actions while a slow approve request is pending', async () => {
		const { fixture, api, el, cmp } = await render();
		typeReason(el, 'Valid reason');
		fixture.detectChanges();
		jest.useFakeTimers();
		api.latencyMs = 2000;
		const approve = jest.spyOn(api, 'approve');
		void cmp.approve();
		fixture.detectChanges();
		expect(approve).toHaveBeenCalledTimes(1);
		expect((el.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
		expect((el.querySelector('.cr-actions__reject-btn') as HTMLButtonElement).disabled).toBe(true);
		expect(el.querySelector('.cr-status').textContent).toContain('PENDING_APPROVAL');
		await jest.advanceTimersByTimeAsync(2000);
		fixture.detectChanges();
		expect(el.querySelector('.cr-status').textContent).toContain('APPROVED');
		expect(cmp.submitting).toBe(false);
	});

	it('shows an error when approve fails without changing the CR', async () => {
		const { fixture, api, el, cmp } = await render();
		jest.spyOn(api, 'approve').mockImplementationOnce(failLater);
		await cmp.approve();
		await settle(fixture);
		expect(el.querySelector('.cr-actions__error').textContent).toContain('Network error. Nothing was changed');
		expect(el.querySelector('.cr-status').textContent).toContain('PENDING_APPROVAL');
		expect((el.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(false);
	});

	it('reloads the saved state when failNext rejects after saving the action', async () => {
		const { fixture, api, el, cmp } = await render();
		api.failNext = true;
		await cmp.approve();
		await settle(fixture);
		expect(el.querySelector('.cr-status').textContent).toContain('APPROVED');
		expect(el.querySelector('.cr-actions__error')).toBeNull();
		expect(
			Array.from(el.querySelectorAll('.cr-timeline__action')).filter((entry: Element) => entry.textContent === 'APPROVE'),
		).toHaveLength(1);
	});

	it('shows the detail load error if the action and its recovery reload both fail', async () => {
		const { fixture, api, el, cmp } = await render();
		jest.spyOn(api, 'approve').mockImplementationOnce(failLater);
		jest.spyOn(api, 'getChangeRequest').mockImplementationOnce(failLater);
		await cmp.approve();
		await settle(fixture);
		expect(el.querySelector('.cr-detail__error')).not.toBeNull();
		expect(el.querySelector('.cr-actions__approve')).toBeNull();
	});
});
