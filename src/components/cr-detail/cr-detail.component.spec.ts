import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('renders the CR-1 diff kinds and totals', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const rowKinds = Array.from(fixture.nativeElement.querySelectorAll('.cr-diff__row')).map((row: Element) =>
			row.getAttribute('data-kind'),
		);
		expect(rowKinds).toEqual(['changed', 'unchanged']);
		const totals = fixture.nativeElement.querySelector('.cr-detail__totals').textContent;
		expect(totals).toContain('USD 8,000.00');
		expect(totals).toContain('USD 8,500.00');
		expect(totals).toContain('USD 500.00');
	});

	it('renders the approval timeline chronologically', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const actions = Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action')).map(
			(element: Element) => element.textContent,
		);
		expect(actions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('shows the before and after descriptions for CR-2', async () => {
		const fixture = await render(users.approver, 'CR-2');
		const changedRow: HTMLTableRowElement = fixture.nativeElement.querySelector('.cr-diff__row[data-kind="changed"]');
		expect(changedRow.textContent).toContain('Widget B');
		expect(changedRow.textContent).toContain('Widget B (new supplier)');
	});

	it('shows a not-found error for a change request outside the user org', async () => {
		const fixture = await render(users.otherOrg, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Not found');
		expect(fixture.nativeElement.querySelector('.cr-detail__error button')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions__approve')).toBeNull();
	});

	it('reloads when the selected change request id changes', async () => {
		const fixture = await render(users.approver, 'CR-1');
		fixture.componentInstance.id = 'CR-3';
		fixture.componentInstance.ngOnChanges({ id: new SimpleChange('CR-1', 'CR-3', false) });
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Extend agreement term');
	});

	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	it('offers enabled actions to an approver on a pending CR', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).not.toBeNull();
	});

	it('shows the diff but no reject action to a read-only viewer', async () => {
		const fixture = await render(users.viewer, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-diff__table')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('does not offer actions to an approver when the CR is already applied', async () => {
		const fixture = await render(users.approver, 'CR-2');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});
});
