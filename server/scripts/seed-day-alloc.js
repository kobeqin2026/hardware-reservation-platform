const Database = require("better-sqlite3");
const db = new Database(process.cwd() + "/src/data/hardware_reservation.db");
const cnt = db.prepare("SELECT COUNT(*) as c FROM day_allocations").get().c;
if (cnt < 200) {
  const DAYS = [], s = new Date(2026, 8, 28), e = new Date(2026, 9, 11), c = new Date(s);
  while (c <= e) { DAYS.push(new Date(c).getTime()); c.setDate(c.getDate() + 1); }
  const RAW = [
    ['board','board','board','board','slt','slt','board','board','board','board','board','board','board','board'],
    ['board','board','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd'],
    ['jtag','jtag','jtag','jtag','diag','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
    ['jtag','jtag','jtag','jtag','jtag','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
    ['firmware','firmware','firmware','slt','slt','swmodel','ppo','ppo','ppo','ppo','ppo','ppo','ppo','ppo'],
    ['swtool','swtool','ucie','ucie','slt','slt','slt','slt','slt','slt','slt','slt','slt','slt'],
    ['pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie'],
    ['pcie','pcie','pcie','pcie','pcie','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
    ['hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm'],
    ['hbm','hbm','hbm','hbm','video','video','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm'],
    ['ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie'],
    ['ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet'],
    ['diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag'],
    ['diag','diag','umd','umd','umd','umd','umd','','swci','swci','swci','swci','swci','swci'],
    ['mbist','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet'],
  ];
  const ins = db.prepare("INSERT OR IGNORE INTO day_allocations (platform_id, date_stamp, team_id, stage_id) VALUES (?,?,?,?)");
  db.transaction(() => {
    for (let bi = 0; bi < 15; bi++) {
      const pid = "BU" + (bi + 1);
      for (let di = 0; di < 14; di++) {
        const t = RAW[bi][di].trim().toLowerCase();
        if (!t || t === '') continue;
        ins.run(pid, DAYS[di], t, 'BU');
      }
    }
  })();
  console.log("day_alloc rebuilt:", db.prepare("SELECT COUNT(*) as c FROM day_allocations").get().c);
} else {
  console.log("day_alloc OK:", cnt);
}
db.close();