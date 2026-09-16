const STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Tahoma, Verdana, Geneva, sans-serif;
  font-size: 11px;
  color: #333;
  background: #d4d0c8;
}
a { color: #00309c; text-decoration: underline; }

/* Title bar */
.ctl00_TitleBar {
  background: #123f7d;
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}
.ctl00_TitleBar_Logo {
  width: 18px;
  height: 18px;
  background: #c9a227;
  margin-right: 10px;
  flex-shrink: 0;
}
.ctl00_TitleBar_Wordmark {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 16px;
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.ctl00_TitleBar_Right {
  margin-left: auto;
  color: #b0c4de;
  font-size: 9px;
}

/* Nav pane */
.ctl00_NavPane {
  width: 176px;
  min-height: calc(100vh - 42px - 22px);
  background: #d4d0c8;
  border-right: 2px solid #a9a29a;
  float: left;
  padding: 8px 0;
  font-size: 11px;
}
.ctl00_NavPane_Section {
  padding: 6px 12px 4px;
  font-size: 9px;
  font-weight: 700;
  color: #5a5a5a;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ctl00_NavPane_Item {
  display: block;
  padding: 5px 12px 5px 20px;
  color: #00309c;
  text-decoration: none;
  font-size: 11px;
}
.ctl00_NavPane_Item:hover { background: #c8c4bc; }
.ctl00_NavPane_Item_Active {
  background: #123f7d;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
}

/* Module tab strip */
.ctl00_TabStrip {
  background: #c8d4e8;
  border-bottom: 1px solid #a9a29a;
  display: flex;
  padding: 0 8px;
}
.ctl00_TabStrip_Tab {
  padding: 5px 14px;
  font-size: 10px;
  font-weight: 700;
  color: #0a2a5e;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  text-decoration: none;
}
.ctl00_TabStrip_Tab_Active {
  background: #f4f2ee;
  border-color: #a9a29a;
  border-bottom: 1px solid #f4f2ee;
  margin-bottom: -1px;
}

/* Breadcrumb */
.ctl00_Breadcrumb {
  background: #c8d4e8;
  padding: 4px 14px;
  font-size: 11px;
  font-weight: 700;
  color: #0a2a5e;
  border-bottom: 1px solid #a9a29a;
}

/* Content area */
.ctl00_ContentArea {
  margin-left: 176px;
  background: #f4f2ee;
  min-height: calc(100vh - 42px - 22px);
}
.ctl00_ContentMain {
  padding: 14px 18px;
}

/* Panels */
.ctl00_Panel {
  background: #e8e4dc;
  border: 2px solid #a9a29a;
  margin-bottom: 12px;
}
.ctl00_Panel_Head {
  background: #0a2a5e;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 10px;
  letter-spacing: 0.3px;
}
.ctl00_Panel_Body {
  padding: 10px;
}

/* Grid / table */
.ctl00_Grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ctl00_Grid th {
  background: #c8d4e8;
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border: 1px solid #a9a29a;
  text-align: left;
  color: #0a2a5e;
}
.ctl00_Grid td {
  padding: 4px 8px;
  border: 1px solid #a9a29a;
  background: #fff;
  vertical-align: top;
}

/* Buttons */
.ctl00_Btn {
  font-family: Tahoma, Verdana, Geneva, sans-serif;
  font-size: 11px;
  padding: 3px 16px;
  background: #d4d0c8;
  border: 2px outset #f4f2ee;
  cursor: pointer;
  color: #333;
}
.ctl00_Btn:hover { background: #c8c4bc; }
.ctl00_Btn:active { border-style: inset; }

/* Inputs */
.ctl00_Input {
  font-family: Tahoma, Verdana, Geneva, sans-serif;
  font-size: 11px;
  padding: 2px 4px;
  border: 2px inset #d4d0c8;
  background: #fff;
}
.ctl00_Select {
  font-family: Tahoma, Verdana, Geneva, sans-serif;
  font-size: 11px;
  padding: 1px 2px;
  border: 2px inset #d4d0c8;
  background: #fff;
}

/* Notices & errors */
.ctl00_Notice {
  background: #fffde7;
  color: #5a4a00;
  border: 1px solid #a9a29a;
  padding: 8px 12px;
  font-size: 11px;
  margin-bottom: 12px;
}
.ctl00_Error {
  background: #ffe8e8;
  color: #7a0000;
  border: 2px solid #a00;
  padding: 8px 12px;
  font-size: 10px;
  margin-bottom: 12px;
}
.ctl00_Error ul { margin-left: 18px; }
.ctl00_Error li { margin-bottom: 2px; }
.ctl00_Input_Error {
  background: #ffe8e8;
  border: 2px inset #a00;
}
.ctl00_Label_Error {
  color: #a00;
  font-weight: 700;
}

/* Status bar */
.ctl00_StatusBar {
  background: #e8e4dc;
  border-top: 1px solid #a9a29a;
  padding: 3px 12px;
  font-size: 9px;
  color: #5a5a5a;
  display: flex;
  justify-content: space-between;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

/* Login-specific */
.ctl00_LoginPanel {
  width: 440px;
  margin: 60px auto;
  background: #e8e4dc;
  border: 2px solid #a9a29a;
}
.ctl00_LoginPanel .ctl00_Panel_Body { padding: 16px 20px; }
.ctl00_LoginField {
  margin-bottom: 10px;
}
.ctl00_LoginField td:first-child {
  width: 96px;
  font-size: 11px;
  font-weight: 700;
  padding-right: 8px;
  text-align: right;
  vertical-align: middle;
}
.ctl00_LoginField td:last-child { vertical-align: middle; }
.ctl00_LoginFooter {
  font-size: 9px;
  color: #888;
  margin-top: 14px;
  line-height: 1.4;
}

/* Row highlight (inline, no class — used via style attr) */

/* Closed row */
.ctl00_Row_Closed td {
  color: #999;
  background: #f0eeea;
}

/* As-of timestamp in grids */
.ctl00_AsOf {
  font-size: 9px;
  color: #5a5a5a;
  text-align: right;
  padding: 2px 8px;
}

/* Member info grid */
.ctl00_MemberInfo {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ctl00_MemberInfo td {
  padding: 3px 8px;
  vertical-align: top;
}
.ctl00_MemberInfo_Label {
  font-weight: 700;
  color: #333;
  width: 110px;
}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function loginPage(opts: { error?: string; expired?: boolean } = {}): string {
  const errorBlock = opts.expired
    ? `<div class="ctl00_Error" style="margin-bottom:14px">
        <strong>Session Expired.</strong> Your session has timed out due to inactivity.
        Please sign in again to continue.
      </div>`
    : opts.error
      ? `<div class="ctl00_Error" style="margin-bottom:14px">
          <strong>ERR-AUTH-001:</strong> ${escapeHtml(opts.error)}
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Meridian Core - Sign In</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="ctl00_TitleBar">
    <div class="ctl00_TitleBar_Logo"></div>
    <span class="ctl00_TitleBar_Wordmark">Meridian Core</span>
    <span class="ctl00_TitleBar_Right">Not signed in</span>
  </div>

  <div style="background:#f4f2ee; min-height:calc(100vh - 42px - 22px);">
    <div class="ctl00_LoginPanel">
      <div class="ctl00_Panel_Head">SIGN IN</div>
      <div class="ctl00_Panel_Body">
        ${errorBlock}
        <form method="POST" action="/login">
          <table class="ctl00_LoginField">
            <tr>
              <td>User ID:</td>
              <td><input type="text" name="ctl00$ContentMain$txtUserID" id="ctl00_ContentMain_txtUserID" class="ctl00_Input" style="width:200px" /></td>
            </tr>
          </table>
          <table class="ctl00_LoginField">
            <tr>
              <td>Password:</td>
              <td><input type="password" name="ctl00$ContentMain$txtPassword" id="ctl00_ContentMain_txtPassword" class="ctl00_Input" style="width:200px" /></td>
            </tr>
          </table>
          <table class="ctl00_LoginField">
            <tr>
              <td>Branch:</td>
              <td>
                <select name="ctl00$ContentMain$ddlBranch" id="ctl00_ContentMain_ddlBranch" class="ctl00_Select" style="width:206px">
                  <option value="MAIN">MAIN</option>
                  <option value="WEST">WEST</option>
                  <option value="EAST">EAST</option>
                  <option value="NORTH">NORTH</option>
                </select>
              </td>
            </tr>
          </table>
          <div style="text-align:right; margin-top:12px">
            <input type="submit" value="Sign In" id="ctl00_ContentMain_btnLogin" class="ctl00_Btn" />
            <input type="reset" value="Clear" class="ctl00_Btn" style="margin-left:6px" />
          </div>
          <div class="ctl00_LoginFooter">
            By signing in, you acknowledge that all activity is subject to monitoring
            and audit in accordance with institutional policy. Unauthorized access
            is prohibited and may result in disciplinary action.
          </div>
        </form>
      </div>
    </div>
  </div>

  <div class="ctl00_StatusBar">
    <span>Meridian Core v3.8.2-hotfix4</span>
    <span>&copy; 2003–2024 Meridian Financial Systems, Inc.</span>
  </div>
</body>
</html>`;
}

export function chrome(opts: {
  title: string;
  breadcrumb: string;
  activeNav: string;
  activeTab: string;
  content: string;
  user: string;
  statusMessage?: string;
}): string {
  const navItems = [
    { section: 'MEMBER SERVICES', items: [
      { id: 'search', label: 'Member Search', href: '/members/search' },
      { id: 'detail', label: 'Member Detail', href: '#' },
      { id: 'open-account', label: 'Open Sub-Account', href: '#' },
    ]},
    { section: 'REPORTS', items: [
      { id: 'daily', label: 'Daily Activity', href: '#' },
      { id: 'audit', label: 'Audit Trail', href: '#' },
    ]},
    { section: 'ADMINISTRATION', items: [
      { id: 'users', label: 'User Management', href: '#' },
      { id: 'branches', label: 'Branch Config', href: '#' },
    ]},
  ];

  const tabs = [
    { id: 'members', label: 'Members' },
    { id: 'shares', label: 'Shares' },
    { id: 'loans', label: 'Loans' },
    { id: 'gl', label: 'General Ledger' },
  ];

  const navHtml = navItems
    .map(
      (section) =>
        `<div class="ctl00_NavPane_Section">${section.section}</div>` +
        section.items
          .map(
            (item) =>
              `<a href="${item.href}" class="ctl00_NavPane_Item${item.id === opts.activeNav ? ' ctl00_NavPane_Item_Active' : ''}">${item.label}</a>`,
          )
          .join(''),
    )
    .join('');

  const tabHtml = tabs
    .map(
      (tab) =>
        `<span class="ctl00_TabStrip_Tab${tab.id === opts.activeTab ? ' ctl00_TabStrip_Tab_Active' : ''}">${tab.label}</span>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Meridian Core - ${escapeHtml(opts.title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="ctl00_TitleBar">
    <div class="ctl00_TitleBar_Logo"></div>
    <span class="ctl00_TitleBar_Wordmark">Meridian Core</span>
    <span class="ctl00_TitleBar_Right">Signed in: ${escapeHtml(opts.user)} | <a href="/logout" style="color:#b0c4de; font-size:9px">Sign Out</a></span>
  </div>

  <div class="ctl00_NavPane">
    ${navHtml}
  </div>

  <div class="ctl00_ContentArea">
    <div class="ctl00_TabStrip">${tabHtml}</div>
    <div class="ctl00_Breadcrumb">${opts.breadcrumb}</div>
    <div class="ctl00_ContentMain">
      ${opts.content}
    </div>
  </div>

  <div class="ctl00_StatusBar">
    <span>${opts.statusMessage ?? 'Ready'}</span>
    <span>&copy; 2003–2024 Meridian Financial Systems, Inc.</span>
  </div>
</body>
</html>`;
}

export function memberSearchPage(opts: {
  criteria?: { memberNumber?: string; branch?: string; includeClosed?: boolean };
  results?: Array<{
    memberNumber: string;
    name: string;
    branch: string;
    memberSince: string;
    phone: string;
    status: string;
    highlighted: boolean;
  }>;
  searched: boolean;
  validationErrors?: string[];
}): string {
  const c = opts.criteria ?? {};

  const branchOptions = ['ALL', 'MAIN', 'WEST', 'EAST', 'NORTH']
    .map(
      (b) =>
        `<option value="${b}"${b === (c.branch ?? 'ALL') ? ' selected' : ''}>${b}</option>`,
    )
    .join('');

  let resultsHtml = '';
  if (opts.searched && opts.results) {
    const rows = opts.results
      .map((r) => {
        const rowStyle = r.highlighted ? ' style="background:#ffffcc"' : '';
        return `<tr>
          <td${rowStyle}>${escapeHtml(r.memberNumber)}</td>
          <td${rowStyle}><a href="javascript:void(0)" onclick="this.parentNode.querySelector('form').submit()">${escapeHtml(r.name)}</a>
            <form method="POST" action="/members/detail" style="display:none">
              <input type="hidden" name="ctl00$ContentMain$hdnMemberNo" value="${escapeHtml(r.memberNumber)}" />
            </form>
          </td>
          <td${rowStyle}>${escapeHtml(r.branch)}</td>
          <td${rowStyle}>${escapeHtml(r.memberSince)}</td>
          <td${rowStyle}>${escapeHtml(r.phone)}</td>
          <td${rowStyle}>${escapeHtml(r.status)}</td>
        </tr>`;
      })
      .join('');

    const gridBody =
      opts.results.length > 0
        ? `<tbody>${rows}</tbody>`
        : `<tbody>
            <tr><td colspan="6" style="text-align:center; padding:18px; color:#888; font-size:11px; background:#fff">
              No records matched the supplied criteria.
            </td></tr>
          </tbody>`;

    const footer =
      opts.results.length > 0
        ? `<div style="padding:6px 10px; font-size:9px; color:#5a5a5a">${opts.results.length} record(s) returned</div>`
        : '';

    const noticeStrip =
      opts.results.length === 0
        ? `<div class="ctl00_Notice" style="margin-top:8px">
            <strong>INFO-SCH-0291:</strong> Verify member number and try again.
            Contact the help desk if the problem persists.
          </div>`
        : `<div class="ctl00_Notice" style="margin-top:8px">
            <strong>MAINT-2024-0847:</strong> Scheduled maintenance window Sunday 02:00–06:00 EST.
            Online services may be intermittently unavailable.
          </div>`;

    resultsHtml = `
      <div class="ctl00_Panel" style="margin-top:12px">
        <div class="ctl00_Panel_Head">SEARCH RESULTS</div>
        <div class="ctl00_Panel_Body" style="padding:0">
          <table class="ctl00_Grid" id="ctl00_ContentMain_grdResults">
            <colgroup>
              <col style="width:90px">
              <col>
              <col style="width:100px">
              <col style="width:90px">
              <col style="width:80px">
              <col style="width:70px">
            </colgroup>
            <thead>
              <tr>
                <th>Member No</th>
                <th>Member Name</th>
                <th>Branch</th>
                <th>Open Date</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            ${gridBody}
          </table>
          ${footer}
        </div>
      </div>
      ${noticeStrip}
    `;
  }

  const hasErrors = opts.validationErrors && opts.validationErrors.length > 0;
  const errorBlock = hasErrors
    ? `<div class="ctl00_Error">
        <ul>${opts.validationErrors!.map((e) => `<li>${e}</li>`).join('')}</ul>
      </div>`
    : '';

  const mbrNoInputClass = hasErrors ? 'ctl00_Input ctl00_Input_Error' : 'ctl00_Input';
  const mbrNoLabelClass = hasErrors ? 'ctl00_Label_Error' : '';

  return `
    ${errorBlock}
    <div class="ctl00_Panel">
      <div class="ctl00_Panel_Head">SEARCH CRITERIA</div>
      <div class="ctl00_Panel_Body">
        <form method="POST" action="/members/search" id="ctl00_ContentMain_frmSearch">
          <table style="border-collapse:collapse">
            <tr>
              <td style="padding:4px 8px 4px 0; font-size:11px" class="${mbrNoLabelClass}">Member No:</td>
              <td style="padding:4px 8px">
                <input type="text" name="ctl00$ContentMain$txtMbrNo" id="ctl00_ContentMain_txtMbrNo"
                  class="${mbrNoInputClass}" style="width:120px"
                  value="${escapeHtml(c.memberNumber ?? '')}" />
              </td>
              <td style="padding:4px 8px 4px 20px; font-size:11px">Branch:</td>
              <td style="padding:4px 8px">
                <select name="ctl00$ContentMain$ddlBranch" id="ctl00_ContentMain_ddlBranch" class="ctl00_Select">
                  ${branchOptions}
                </select>
              </td>
              <td style="padding:4px 8px 4px 20px">
                <label style="font-size:11px">
                  <input type="checkbox" name="ctl00$ContentMain$chkIncludeClosed" id="ctl00_ContentMain_chkIncludeClosed"
                    ${c.includeClosed ? 'checked' : ''} />
                  Include Closed
                </label>
              </td>
            </tr>
          </table>
          <div style="margin-top:10px">
            <input type="submit" value="Search" id="ctl00_ContentMain_btnSearch" class="ctl00_Btn" />
            <input type="button" value="Clear" id="ctl00_ContentMain_btnClear" class="ctl00_Btn" style="margin-left:4px"
              onclick="document.getElementById('ctl00_ContentMain_txtMbrNo').value=''" />
            <input type="button" value="Advanced Query" id="ctl00_ContentMain_btnAdvanced" class="ctl00_Btn" style="margin-left:4px" />
          </div>
        </form>
      </div>
    </div>
    ${resultsHtml}
  `;
}

export function memberDetailPage(member: {
  memberNumber: string;
  name: string;
  ssn: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  branch: string;
  memberSince: string;
  shares: Array<{
    id: string;
    typeCode: string;
    description: string;
    currentBalance: string;
    availableBalance: string;
    maturityDate: string;
    status: 'Open' | 'Closed';
  }>;
}): string {
  const now = new Date();
  const asOf = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const shareRows = member.shares
    .map((s) => {
      const isClosed = s.status === 'Closed';
      const rowClass = isClosed ? ' class="ctl00_Row_Closed"' : '';
      return `<tr${rowClass}>
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(s.description)} (${escapeHtml(s.typeCode)})</td>
        <td style="text-align:right">$${escapeHtml(s.currentBalance)}</td>
        <td style="text-align:right">${s.availableBalance === '—' ? '—' : '$' + escapeHtml(s.availableBalance)}</td>
        <td>${escapeHtml(s.maturityDate) || '—'}</td>
        <td>${escapeHtml(s.status)}</td>
      </tr>`;
    })
    .join('');

  const openShares = member.shares.filter((s) => s.status === 'Open');
  const totalBalance = openShares.reduce((sum, s) => {
    const val = parseFloat(s.currentBalance.replace(/,/g, ''));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const totalFormatted = totalBalance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `
    <div class="ctl00_Panel">
      <div class="ctl00_Panel_Head">MEMBER INFORMATION</div>
      <div class="ctl00_Panel_Body">
        <table class="ctl00_MemberInfo">
          <tr>
            <td class="ctl00_MemberInfo_Label">Member No:</td>
            <td>${escapeHtml(member.memberNumber)}</td>
            <td class="ctl00_MemberInfo_Label">Name:</td>
            <td>${escapeHtml(member.name)}</td>
          </tr>
          <tr>
            <td class="ctl00_MemberInfo_Label">SSN:</td>
            <td>${escapeHtml(member.ssn)}</td>
            <td class="ctl00_MemberInfo_Label">DOB:</td>
            <td>${escapeHtml(member.dob)}</td>
          </tr>
          <tr>
            <td class="ctl00_MemberInfo_Label">Address:</td>
            <td>${escapeHtml(member.address)}</td>
            <td class="ctl00_MemberInfo_Label">Phone:</td>
            <td>${escapeHtml(member.phone)}</td>
          </tr>
          <tr>
            <td class="ctl00_MemberInfo_Label">City/State/Zip:</td>
            <td>${escapeHtml(member.city)}, ${escapeHtml(member.state)} ${escapeHtml(member.zip)}</td>
            <td class="ctl00_MemberInfo_Label">Email:</td>
            <td>${escapeHtml(member.email)}</td>
          </tr>
          <tr>
            <td class="ctl00_MemberInfo_Label">Branch:</td>
            <td>${escapeHtml(member.branch)}</td>
            <td class="ctl00_MemberInfo_Label">Member Since:</td>
            <td>${escapeHtml(member.memberSince)}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="ctl00_Panel">
      <div class="ctl00_Panel_Head">
        SHARE SUMMARY
        <span style="float:right; font-weight:400; text-transform:none; font-size:9px">
          As of ${asOf}
        </span>
      </div>
      <div class="ctl00_Panel_Body" style="padding:0">
        <table class="ctl00_Grid" id="ctl00_ContentMain_grdShares">
          <colgroup>
            <col style="width:70px">
            <col>
            <col style="width:116px">
            <col style="width:108px">
            <col style="width:98px">
            <col style="width:86px">
          </colgroup>
          <thead>
            <tr>
              <th>Share ID</th>
              <th>Description</th>
              <th style="text-align:right">Current Balance</th>
              <th style="text-align:right">Available</th>
              <th>Maturity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${shareRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align:right; font-weight:700; background:#e8e4dc">Total (Open):</td>
              <td style="text-align:right; font-weight:700; background:#e8e4dc">$${totalFormatted}</td>
              <td colspan="3" style="background:#e8e4dc"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div style="margin-top:10px">
      <input type="button" value="Open Sub-Account" id="ctl00_ContentMain_btnOpenSub" class="ctl00_Btn" />
      <input type="button" value="Transfer" id="ctl00_ContentMain_btnTransfer" class="ctl00_Btn" style="margin-left:4px" />
      <input type="button" value="Print Statement" id="ctl00_ContentMain_btnPrint" class="ctl00_Btn" style="margin-left:4px" />
      <form method="POST" action="/members/search" style="display:inline">
        <input type="submit" value="&laquo; Back to Search" id="ctl00_ContentMain_btnBack" class="ctl00_Btn" style="margin-left:4px" />
      </form>
    </div>
  `;
}

export { escapeHtml };
