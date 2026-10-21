import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { canApprovePolicy } from '../../common/permissions';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges {
	@Input() id!: string;
	@Output() actionDone = new EventEmitter<string>();

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	rejectControl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] });

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['id'] && !changes['id'].firstChange) {
			void this.load();
		}
	}

	async load(): Promise<void> {
		const id = this.id;
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, id);
			if (id !== this.id) return;
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			if (id !== this.id) return;
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		const audit = this.detail?.audit ?? [];
		return [...audit].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	/** Whether the current user may approve the loaded CR. */
	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		// The README defines no separate reject policy.
		return this.canApprove;
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		await this.runAction(() => this.api.approve(this.session.user, this.id, new Date().toISOString()));
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;
		if (this.rejectControl.invalid) {
			this.rejectControl.markAsTouched();
			return;
		}
		const reason = this.rejectControl.value.trim();
		await this.runAction(() => this.api.reject(this.session.user, this.id, new Date().toISOString(), reason));
	}

	private async runAction(call: () => Promise<CrDetail>): Promise<void> {
		const id = this.id;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await call();
			if (id !== this.id) return;
			this.state = { status: 'loaded', data: updated };
			this.rejectControl.reset();
		} catch (err) {
			if (id !== this.id) return;
			await this.load();
			if (id === this.id && this.detail?.status === 'PENDING_APPROVAL') {
				this.actionError = `Action failed: ${(err as Error).message}. Nothing was changed, please try again.`;
			}
		} finally {
			this.submitting = false;
			this.actionDone.emit(id);
		}
	}
}
