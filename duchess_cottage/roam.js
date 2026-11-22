// 在 #roam-root 中初始化公爵夫人的小屋的 3D 漫游场景。
// 漫游结束时调用 completeScene()，保存完成状态并返回地图。
function completeScene() {
  window.WonderlandProgress.completeScene('duchess_cottage');
  window.location.href = '../index.html';
}
