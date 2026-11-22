// 在 #roam-root 中初始化毛毛虫的树枝的 3D 漫游场景。
// 漫游结束时调用 completeScene()，解锁公爵夫人的小屋并返回地图。
function completeScene() {
  window.WonderlandProgress.completeScene('caterpillar_tree');
  window.location.href = '../../index.html';
}
