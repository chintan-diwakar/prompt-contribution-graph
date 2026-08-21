fn main() {
    if prompt_contribution_graph_lib::capture_mode_from_args() {
        return;
    }
    prompt_contribution_graph_lib::run();
}
