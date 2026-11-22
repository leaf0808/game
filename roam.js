// 在 #roam-root 中初始化兔子洞的 3D 漫游场景。
// 漫游结束时调用 completeScene()，解锁毛毛虫的树枝并返回地图。
function completeScene() {
  window.WonderlandProgress.completeScene('rabbit_hole');
  window.location.href = '../../index.html';
}
